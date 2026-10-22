import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");

function loadRoute(name, { race = false } = {}) {
  const writes = [], publications = [];
  const source = readFileSync(new URL(`../src/app/api/rpa/sharefull/${name}/route.ts`, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  const context = vm.createContext({ exports: {}, console, Date,
    NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) },
    requireTaimeeRpaOperator: async () => {}, isRpaTaimeeError: () => false,
    isSharefullSyncClient: () => true, sharefullTemplateTableName: () => "templates", sharefullRequestTableName: () => "requests",
    sharefullSyncClientIds: () => null, sharefullSyncScopeLabel: () => "test",
    withApiProgress: (handler) => handler,
    enqueueSharefullPublicationJobsForTemplate: async (core) => { publications.push(core); return {registeredCount:1}; },
    enqueueSharefullPublicationJobsForReadyTemplates: async () => { publications.push("all"); return {registeredCount:1,skipped:[]}; },
    supabaseAdmin: { from(table) {
      let updating = false;
      const q = { select: () => q, eq: () => q, is: () => q, gte: () => q, order: () => q, limit: () => q,
        update: (values) => { updating = true; writes.push({table,values}); return q; },
        maybeSingle: async () => ({data: updating ? (race ? null : {core_id:"core-1"}) : {core_id:"core-1",sharefull_template_id:"466923"}, error:null}),
        then: (resolve) => Promise.resolve({data:[],error:null}).then(resolve),
      }; return q;
    } },
  });
  vm.runInContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, context);
  return {route:context.exports,writes,publications};
}
const observation = {core_id:"core-1",sharefull_template_id:"466923",sharefull_template_status:"ready_for_offer"};
test("old extensions without an observed ID cannot change review state or publish", async () => {
  const h=loadRoute("template-status");
  const r=await h.route.POST({json:async()=>({...observation,sharefull_template_id:undefined})});
  assert.equal(r.status,409); assert.equal(h.writes.length,0); assert.equal(h.publications.length,0);
});
test("a stale template ID is rejected without changing current state", async () => {
  const h=loadRoute("template-status");
  assert.equal((await h.route.POST({json:async()=>({...observation,sharefull_template_id:"466816"})})).status,409);
  assert.equal(h.writes.length,0); assert.equal(h.publications.length,0);
});
test("a matching pending observation demotes the template without publication", async () => {
  const h=loadRoute("template-status");
  assert.equal((await h.route.POST({json:async()=>({...observation,sharefull_template_status:"template_review"})})).status,200);
  assert.equal(h.writes[0].values.sharefull_template_status,"template_review"); assert.equal(h.publications.length,0);
});
test("matching approved observations retain automatic publication", async () => {
  const h=loadRoute("template-status");
  assert.equal((await h.route.POST({json:async()=>observation})).status,200);
  assert.deepEqual(h.publications,["core-1"]);
});
test("a template replaced between lookup and update cannot publish", async () => {
  const h=loadRoute("template-status",{race:true});
  assert.equal((await h.route.POST({json:async()=>observation})).status,409);
  assert.equal(h.publications.length,0);
});
test("review-monitor reads cannot enqueue jobs; normal list reconciliation remains", async () => {
  for(const readOnly of [true,false]){
    const h=loadRoute("cases");
    const r=await h.route.GET({nextUrl:new URL(`https://example.test/api/rpa/sharefull/cases${readOnly?'?read_only=true':''}`)});
    assert.equal(r.status,200); assert.equal(h.publications.length,readOnly?0:1);
  }
});
