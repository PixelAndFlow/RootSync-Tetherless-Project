import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

test("DDIL native IndexedDB with separate tabs and no Web Locks", { timeout: 120_000 }, async (t) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const server = await createServer({ root, configFile: false, logLevel: "silent", plugins: [{
    name: "native-ddil-test-page",
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== "/native-ddil-test") return next();
        response.setHeader("content-type", "text/html");
        response.end("<!doctype html><title>Disposable DDIL test</title>");
      });
    },
  }], server: { host: "127.0.0.1", port: 0 } });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }));
    const a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) {
      await page.goto(`${origin}/native-ddil-test`);
      await page.evaluate(async () => {
        window.dbm = await import("/src/sync/stores/db.ts");
        window.leases = await import("/src/sync/engine/lease.ts");
        window.SyncEngine = (await import("/src/sync/engine/sync.ts")).SyncEngine;
        window.db = await dbm.openDatabase(indexedDB);
        window.otherDb = await dbm.openDatabase(indexedDB);
        window.emptyResult = () => ({ skipped:false, claimed:0, acknowledged:0, rejected:0, blockedAuth:0, retried:0, failed:0, recovered:0 });
        window.engine = (database = db, owner = "native-tab", now = 1) => new SyncEngine({ db:database, owner, now:()=>now, transport:{ send:async()=>{ throw Error("unused transport"); } } });
        window.makeEvent = () => ({ event_id:crypto.randomUUID(), device_seq:1, schema_version:1, device_id:crypto.randomUUID(), session_id:crypto.randomUUID(), occurred_at:new Date().toISOString(), monotonic_ms:0, event_type:"session_started", payload:{visibility:"visible"} });
        window.reset = async () => {
          const transaction = db.transaction(dbm.ALL_STORES, "readwrite");
          for (const name of dbm.ALL_STORES) transaction.objectStore(name).clear();
          await new Promise((resolve,reject)=>{ transaction.oncomplete=resolve;transaction.onabort=transaction.onerror=reject; });
        };
      });
    }

    await t.test("200 sequence reservations are unique across two actual browser tabs", async () => {
      await a.evaluate(()=>reset());
      const values=(await Promise.all([a,b].map(page=>page.evaluate(async()=>{
        const values=[];for(let i=0;i<100;i++) values.push(await dbm.reserveDeviceSeq(db));return values;
      })))).flat();
      assert.equal(new Set(values).size,200);
      assert.equal(Math.min(...values),1);assert.equal(Math.max(...values),200);
    });

    await t.test("two tabs cannot claim the same pending event", async () => {
      await a.evaluate(()=>reset());
      const event=await a.evaluate(async()=>{const e=makeEvent();await dbm.recordEvent(db,e,0);return e;});
      const claims=await Promise.all([a,b].map((page,index)=>page.evaluate(async({event,index})=>
        leases.claimBatch(db,[event],{owner:`tab-${index}`,now:0,maxEvents:1}),{event,index})));
      assert.equal(claims.flat().length,1);
    });

    await t.test("an old claim cannot affect a newer claim owned by the same tab", async () => {
      await a.evaluate(()=>reset());
      const result=await a.evaluate(async()=>{
        const event=makeEvent();await dbm.recordEvent(db,event,0);
        const [old]=await leases.claimBatch(db,[event],{owner:"native-tab",now:0,maxEvents:1,leaseMs:1});
        await leases.recoverExpiredLeases(db,2);
        const [fresh]=await leases.claimBatch(db,[event],{owner:"native-tab",now:2,maxEvents:1});
        await engine(db,"native-tab",3).applyOne(old,"auth",0,emptyResult(),"stale 401");
        const after=await dbm.getDelivery(db,event.event_id);
        await engine(db,"native-tab",3).applyOne(fresh,"success",2,emptyResult());
        return {different:old.lease_id!==fresh.lease_id,before:fresh,after,final:(await dbm.getDelivery(db,event.event_id)).status};
      });
      assert.ok(result.different);assert.deepEqual(result.after,result.before);assert.equal(result.final,"acknowledged");
    });

    for (const operation of ["response", "lease recovery", "auth recovery"]) {
      await t.test(`${operation} cannot reverse an acknowledgment committed by another connection`, async () => {
        await a.evaluate(()=>reset());
        const result=await a.evaluate(async(operation)=>{
          const event=makeEvent();await dbm.recordEvent(db,event,0);
          const [claimed]=await leases.claimBatch(db,[event],{owner:"native-tab",now:0,maxEvents:1,leaseMs:10});
          if(operation==="auth recovery") await dbm.putDelivery(db,{...claimed,status:"blocked_auth",lease_owner:null,lease_id:null});
          let injected=false;
          const proxy=new Proxy(db,{get(target,key){
            if(key!=="transaction"){const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}
            return (stores,mode)=>{
              if(mode==="readwrite" && stores.length===1 && stores[0]==="delivery" && !injected){
                injected=true;
                // Queue the other connection before this write transaction.
                // The old split read/write implementation had already read a
                // stale row here; the atomic implementation has not read yet.
                const other=otherDb.transaction(["delivery"],"readwrite");
                other.objectStore("delivery").put({...claimed,status:"acknowledged",lease_owner:null,lease_id:null,lease_expires_at:null,settled_at:1});
              }
              return target.transaction(stores,mode);
            };
          }});
          if(operation==="response") await engine(proxy).applyOne(claimed,"auth",0,emptyResult(),"late 401");
          else if(operation==="lease recovery") await leases.recoverExpiredLeases(proxy,20);
          else await engine(proxy).unblockAuth();
          return {injected,status:(await dbm.getDelivery(db,event.event_id)).status};
        },operation);
        assert.ok(result.injected);assert.equal(result.status,"acknowledged");
      });
    }

    await t.test("a failed update rolls back in native IndexedDB", async()=>{
      await a.evaluate(()=>reset());
      const result=await a.evaluate(async()=>{
        const event=makeEvent();await dbm.recordEvent(db,event,0);
        const before=await dbm.getDelivery(db,event.event_id);
        let rejected=false;
        try{await dbm.updateDelivery(db,event.event_id,()=>{throw Error("injected failure");});}catch{rejected=true;}
        return {rejected,before,after:await dbm.getDelivery(db,event.event_id)};
      });
      assert.ok(result.rejected);assert.deepEqual(result.after,result.before);
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});
