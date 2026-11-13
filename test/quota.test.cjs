const {test}=require('node:test');const assert=require('node:assert/strict');
const {parseQuota,fetchQuota,checkCandidateQuota}=require('../src/quota.cjs');
const data={list:[{id:'73',nm:'Releases',downloadable:true,balance:{allow:true,bytesleft:1000,daysleft:5,hoursleft:120,dateend:'2030-01-02',account_id:123,paymentbase_id:456}}]};
const ready=()=>({status:'ready',sections:parseQuota(data)});
const candidate={sectionId:'73',filesize:100,sizeKnown:true};
test('exibe apenas saldo e validade, sem dados de conta ou pagamento',()=>{
 const sections=parseQuota(data);assert.equal(sections[0].availableBytes,1000);assert.equal(sections[0].expiresOn,'2030-01-02');
 assert.equal(JSON.stringify(sections).includes('account_id'),false);assert.equal(JSON.stringify(sections).includes('paymentbase_id'),false);
});
test('valida por seção e tamanho; não soma créditos de planos diferentes',()=>{
 assert.equal(checkCandidateQuota(ready(),candidate).allowed,true);
 assert.equal(checkCandidateQuota(ready(),{...candidate,filesize:1000}).allowed,true);
 assert.equal(checkCandidateQuota(ready(),{...candidate,filesize:1001}).allowed,false);
 assert.equal(checkCandidateQuota(ready(),{...candidate,sectionId:'74'}).allowed,false);
 assert.equal(checkCandidateQuota(ready(),{...candidate,sectionId:undefined}).allowed,false);
});
test('saldo zero, expirado, sem acesso ou desconhecido bloqueia a fila',()=>{
 for(const patch of [{availableBytes:0},{availableBytes:null},{hoursLeft:0},{daysLeft:-1},{allowed:false}]){
  const quota=ready();Object.assign(quota.sections[0],patch);assert.equal(checkCandidateQuota(quota,candidate).allowed,false);
 }
 assert.equal(checkCandidateQuota({status:'error',sections:[]},candidate).allowed,false);
});
test('conversões não apresentam tamanho original como previsão exata',()=>{
 const result=checkCandidateQuota(ready(),{...candidate,filesize:2000,sizeKnown:false});assert.equal(result.allowed,true);assert.equal(result.estimatedBytes,null);
 const exhausted=ready();exhausted.sections[0].availableBytes=0;assert.equal(checkCandidateQuota(exhausted,{...candidate,sizeKnown:false}).allowed,false);
});
test('consulta usa endpoint do site e trata login expirado sem expor resposta',async()=>{
 const quota=await fetchQuota(async(url,options)=>{
  assert.equal(url,'https://srv.djdelivery.com/a/ms/section');assert.equal(options.credentials,'include');
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 });assert.equal(quota.status,'ready');assert.equal(quota.sections.length,1);
 await assert.rejects(fetchQuota(async()=>new Response('<html>login</html>',{status:401})),/Entre na sua conta/);
 await assert.rejects(fetchQuota(async()=>new Response('{}',{headers:{'content-type':'application/json'}})),/não informou/);
});
