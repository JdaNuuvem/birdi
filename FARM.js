// =====================
// 🐦 FLAP COPA — FARM
// =====================
// COLE ISSO NO CONSOLE DO NAVEGADOR (F12) E TECLE ENTER
// =====================

var VALOR=10, CANOS=999, MAX=10;  // ← MUDE AQUI: aposta, canos, repeticoes

(async()=>{
  var T=localStorage.getItem('flappix_token'),f=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minFrac:2,maxFrac:2});
  if(!T)return console.error('❌ FAÇA LOGIN PRIMEIRO');
  var H={'Authorization':'Bearer '+T,'Content-Type':'application/json'};
  var api=(m,e,b)=>fetch(e,{method:m,headers:H,body:b?JSON.stringify(b):void 0}).then(r=>r.json());
  var saldo=async()=>(await api('GET','/api/user/dashboard')).saldo;

  console.log('%c🐦 FLAP COPA — AUTO FARM','font-size:20px;font-weight:800;color:#4ade80');
  console.log('💰 Saldo:',f(await saldo()),'| Aposta:',f(VALOR),'| Canos:',CANOS,'| Rodadas:',MAX);
  var t=0, o=0;

  for(var i=0;i<MAX;i++){
    var ini=await api('POST','/api/flappybird/iniciar',{valor_entrada:VALOR});
    if(!ini.partida_id){console.log('⛔',ini.error||'Falhou');break;}
    var fin=await api('POST','/api/flappybird/finalizar',{partida_id:ini.partida_id,canos_passados:CANOS,resgatou:!0});
    if(fin.ganhou){o++;t+=fin.valor_ganho_ou_perdido;}
    console.log('#'+(i+1),fin.ganhou?'✅':'❌',f(fin.valor_ganho_ou_perdido||0),'→',f(await saldo()));
    await new Promise(r=>setTimeout(r,500));
  }

  var sf=await saldo();
  console.log('%c🏆 FEITO: '+o+'/'+MAX+' | Ganho: '+f(t)+' | Saldo: '+f(sf),'font-size:16px;font-weight:800;color:#fde047');
})();
