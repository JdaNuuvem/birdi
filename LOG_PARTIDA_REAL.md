# LOG COMPLETO — Partida Real (R$ 3,00)

**Data/hora:** 25/06/2026 ~11:27 BRT  
**Mapa:** Brasil  
**Aposta:** R$ 3,00  
**Meta:** R$ 30,00 (10x)  
**Resultado:** 💥 DERROTA  

---

## Timeline

| Tempo | Evento |
|-------|--------|
| T+0s | Clicou "🎮 Jogar — R$ 3,00" no painel |
| | Redirecionado para: `/jogar?valor=3&auto=1&mapa=brasil` |
| T+0s | `POST /api/flappybird/iniciar` → 200 ✅ Partida criada (ID: 46) |
| | Saldo deduzido: R$ 20 → R$ 17 |
| T+~5s | Jogo carregado no canvas (640x902) |
| T+~8s | Jogo iniciou automaticamente (auto=1) |
| T+~10s | Pássaro colidiu com cano/solo → Game Over |
| | `POST /api/flappybird/finalizar` chamado automaticamente |
| T+~60s | Tela de Game Over exibida |

---

## Fluxo da API

### POST /api/flappybird/iniciar
```json
// Request (estimado pelo código fonte)
{ "valor": 3, "mapa": "brasil" }

// Response (200 OK)
{ "success": true, "data": { "partida_id": 46, "session": "..." } }
```

### POST /api/flappybird/finalizar (automático, chamado pelo jogo)
```json
// Request (estimado)
{ "partida_id": 46, "canos": 0, "pontuacao": 0 }

// Response (200 OK)
{ "success": true, "data": { "resultado": "derrota", "valor_acumulado": 0 } }
```

### Dashboard pós-partida
```json
{ "saldo": 17, "saldo_afiliado": 0, "total_partidas": 1, "vitorias": 0, "recorde_canos": 0 }
```

### Histórico
```json
{
  "partidas": [{
    "id": 46,
    "valor_entrada": "3.00",
    "valor_meta": "30.00",
    "canos_passados": 0,
    "valor_acumulado": "0.00",
    "status": "derrota",
    "created_at": "2026-06-25T14:27:09.000Z",
    "finished_at": "2026-06-25T14:28:09.000Z"
  }]
}
```

---

## Dados do Jogo

**Canvas:** 640x902px (renderizado em canvas HTML5)
**Engine:** JavaScript puro + Canvas API
**Música:** 🎵 Presente (botão "Mutar música" visível)
**Áudio:** Sem tag `<audio>` — provavelmente Web Audio API
**Confetti:** Canvas separado 300x150 (`#fb-confetti`)

### Bundle do jogo
- Arquivo: `app/jogar/page-eb22ff77f2b5901b.js` (64.424 bytes)
- Framework: Next.js RSC (React Server Components)

### Assets carregados durante o jogo:
- `/img/flapbird/birds/background.png` - Fundo do jogo
- `/img/flapbird/birds/bird-brasil.png` - Pássaro (mapa Brasil)
- `/img/flapbird/gif/brasil1.gif` - GIF animado do mapa
- `/img/flapbird/hero.png` - Ícone/logo

---

## Regras Financeiras Confirmadas

| Regra | Valor |
|-------|-------|
| Multiplicador | 10x |
| Aposta | R$ 3,00 |
| Meta | R$ 30,00 |
| Taxa por cano | R$ 0,20 |
| Dedução imediata | ✅ Sim, saldo debitado ao iniciar |
| Perda total | ✅ Se 0 canos, perde aposta integral |
| Recuperação parcial | Se bater meta, ganha prêmio total |

---

## Tela de Game Over

```
💥 GAME OVER
-R$ 3,00
0 canos · 🏅 recorde: 0

[Jogar Novamente]  [Início]
```
