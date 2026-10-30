import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./helpers.ts";
import { allDelivery, getDelivery, openDatabase, setMeta, updateDelivery } from "../../src/sync/stores/db.ts";
import { claimBatch, recoverExpiredLeases } from "../../src/sync/engine/lease.ts";
import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";

test("a replaced claim owned by the same worker rejects its old response", async () => {
  const h = await harness();
  await h.record();
  const [old] = await claimBatch(h.db, [{event_id:"evt-0001",device_seq:1}], {owner:"device-1:tab-1",now:h.now(),maxEvents:1,leaseMs:1});
  h.tick(2);
  await recoverExpiredLeases(h.db,h.now());
  const [fresh] = await claimBatch(h.db, [{event_id:"evt-0001",device_seq:1}], {owner:"device-1:tab-1",now:h.now(),maxEvents:1});
  assert.notEqual(old.lease_id,fresh.lease_id);
  await h.engine["applyOne"](old,"auth",h.now(),{acknowledged:0} as any);
  assert.deepEqual(await getDelivery(h.db,old.event_id),fresh);
});

test("a response arriving after its lease expires leaves work recoverable", async () => {
  const h = await harness();
  await h.record();
  const [old] = await claimBatch(h.db,[{event_id:"evt-0001",device_seq:1}],{owner:"device-1:tab-1",now:h.now(),maxEvents:1,leaseMs:1});
  h.tick(2);
  await h.engine["applyOne"](old,"terminal",h.now(),{rejected:0} as any);
  assert.equal((await getDelivery(h.db,old.event_id))?.status,"inflight");
  await recoverExpiredLeases(h.db,h.now());
  assert.equal((await getDelivery(h.db,old.event_id))?.status,"pending");
});

test("delivery callback failures roll back the transaction", async () => {
  const h = await harness();
  await h.record();
  const before=await getDelivery(h.db,"evt-0001");
  await assert.rejects(updateDelivery(h.db,"evt-0001",()=>{throw new Error("storage failed");}),/storage failed/);
  assert.deepEqual(await getDelivery(h.db,"evt-0001"),before);
});

test("learning sessions and new answers cannot silently reopen authorization", async () => {
  const idb=new FakeIDBFactory();
  const transport=new FakeTransport(Date.now);
  let valid=false;
  const api={post:async()=>({}),get:async()=>{if(!valid)throw new Error("401 Unauthorized");return {modules:[]};}};
  const gw=new DdilLearningGateway({idb,transport,api});
  await gw.init();
  const db=await openDatabase(idb);
  await setMeta(db,"device_token","synthetic restored credential");
  await gw.startSession({learnerId:"student-1",deviceId:"device-1"});
  transport.always({kind:"fail",failure:{kind:"auth",error:"invalid credential"}});
  await gw.requestSync();
  const old=(await allDelivery(db))[0]!;
  await gw.startSession({learnerId:"student-1",deviceId:"device-1"});
  const sends=transport.sendCount;
  await gw.requestSync();
  assert.equal(transport.sendCount,sends);
  assert.equal((await getDelivery(db,old.event_id))?.status,"blocked_auth");
  await assert.rejects(gw.recoverAuth(),/401/);
  assert.equal((await getDelivery(db,old.event_id))?.status,"blocked_auth");
  valid=true;
  assert.equal(await gw.recoverAuth(),1);
  transport.always({kind:"accept_all"});
  await gw.requestSync();
  assert.ok((await allDelivery(db)).every(r=>r.status==="acknowledged"));
});
