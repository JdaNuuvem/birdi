# Análise Completa do Fluxo de Depósito PIX

**Data:** 25/06/2026  
**Gateway:** amplopay  
**Usuário:** habibes (ID: 131)  
**Valor testado:** R$ 20,00

---

## 1. FLUXO COMPLETO DO DEPÓSITO

### Passo 1 — Frontend busca config de depósito
```
GET /api/user/deposito-info?t=1782397377570
Authorization: Bearer <jwt>
```

**Resposta:**
```json
{
  "limites": {
    "deposito_minimo": 20,
    "deposito_maximo": 0,
    "saque_minimo": 20,
    "saque_maximo": 0,
    "saque_afiliado_minimo": 10
  },
  "valores_rapidos": [20, 30, 50, 100, 200],
  "botoes_labels": {
    "20": "MINIMO", "30": "QUENTE", "50": "HOT+CHANCES",
    "100": "BÔNUS", "200": "BÔNUS"
  },
  "botoes_cores": {
    "20": "#ff7300", "30": "#ff0000", "50": "#11d414",
    "100": "#420b6f", "200": "#420b6f"
  },
  "bonus_deposito": {
    "ativo": true,
    "tipo": "todos",
    "percentual": 100,
    "minimo": 50,
    "maximo": 0,
    "rollover": 0
  }
}
```

🔴 **VULNERABILIDADE:** Bônus de 100% para depósitos ≥ R$50. O flag `aceitar_bonus_deposito` é enviado pelo cliente.  
🔴 **VULNERABILIDADE:** `limites.deposito_maximo = 0` significa SEM LIMITE MÁXIMO.

---

### Passo 2 — Usuário clica "Gerar QR Code PIX"
```
POST /api/financeiro/deposito
Authorization: Bearer <jwt>
Content-Type: application/json

Body: { "valor": 20, "cpf": null, "aceitar_bonus_deposito": false }
```

**Resposta (200 OK):**
```json
{
  "txid": "B38DCAE0C15649278B5F2DF8",
  "valor": 20,
  "qrcode_imagem": "data:image/png;base64,...",
  "qrcode_texto": "00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/68e1ab09-9586-4697-9783-7fd91d0d833b5204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***63048546",
  "gateway": "amplopay",
  "expiracao_minutos": 30,
  "instrucao": "Escaneie o QR Code ou use o código copia e cola para pagar."
}
```

🔴 **VULNERABILIDADE:** `aceitar_bonus_deposito` é controlado pelo cliente!  
🔴 **VULNERABILIDADE:** CPF enviado como campo opcional — pode ser armazenado sem criptografia.

---

### Passo 3 — Frontend faz polling a cada 5s
```
GET /api/financeiro/deposito/status/B38DCAE0C15649278B5F2DF8
Authorization: Bearer <jwt>
```

**Resposta (while pending):**
```json
{
  "status": "pendente",
  "valor": 20,
  "saldo_novo": 0,
  "valor_bonus": 0,
  "valor_creditado_total": 20,
  "bonus_rollover_multiplicador": 0
}
```

**Resposta esperada (quando aprovado):**
```json
{
  "status": "aprovado",
  "valor": 20,
  "saldo_novo": 20,
  "valor_bonus": 0,
  "valor_creditado_total": 20,
  "bonus_rollover_multiplicador": 0
}
```

---

## 2. GATEWAY DE PAGAMENTO: amplopay

### Dados extraídos do QR Code PIX
| Campo | Valor |
|---|---|
| **Gateway** | amplopay |
| **Domínio do QR Code** | `qrcode.a55scd.com.br` |
| **Merchant (recebedor)** | **SGC INTERMEDIACOES** |
| **Cidade** | São Paulo |
| **TxID** | `68e1ab09-9586-4697-9783-7fd91d0d833b` |
| **Expiracao** | 30 minutos |

### Estrutura do QR Code PIX decodificado:
```
000201010212
  26820014br.gov.bcb.pix
    2560qrcode.a55scd.com.br/v1/68e1ab09-9586-4697-9783-7fd91d0d833b
  52040000
  5303986
  5802BR
  5917SGCINTERMEDIACOES
  6008SAOPAULO
  62070503***
  63048546
```

### Sobre o amplopay
- É um gateway white-label de pagamentos PIX
- O merchant real registrado na BCB é "SGC INTERMEDIACOES"
- O gateway gera QR Codes dinâmicos via API
- O servidor do Flap Copa recebe callback do amplopay quando o PIX é pago
- O polling do frontend verifica o status no servidor, não diretamente no gateway

---

## 3. FLUXO DE CALLBACK (estimado)

```
CLIENTE                          SERVIDOR FLAP COPA              GATEWAY AMPLOPAY
   |                                    |                              |
   |--- POST /deposito (R$20) -------->|                              |
   |<--- { txid, qrcode_texto } -------|                              |
   |                                    |                              |
   |--- Paga PIX (copia e cola) -------|                              |
   |                                    |--- POST /webhook (callback)->|
   |                                    |<--- { status: "aprovado" } --|
   |                                    |                              |
   |--- GET /status/{txid} (poll 5s) -->|                              |
   |<--- { status: "aprovado" } --------|                              |
   |                                    |                              |
   |--- GET /dashboard --------------->|                              |
   |<--- { saldo: 20 } ----------------|                              |
```

**O callback NÃO está exposto no frontend.** O webhook chega diretamente do gateway para o servidor.

---

## 4. VULNERABILIDADES IDENTIFICADAS NESSE FLUXO

### 🔴 Crítica — Bônus client-side
O campo `aceitar_bonus_deposito` é enviado do frontend. Se o servidor não validar no backend, um usuário que deposite R$50+ pode manipular o bônus.

### 🔴 Crítica — Sem limite máximo de depósito
`deposito_maximo: 0` significa que não há limite superior. Ataque de depósitos massivos.

### 🟠 Alta — CPF opcional sem validação
O CPF é passado como campo opcional. Se enviado, pode ser armazenado sem criptografia.

### 🟠 Alta — TxID previsível
`B38DCAE0C15649278B5F2DF8` — formato hexadecimal de 16 caracteres. Se for sequencial ou baseado em timestamp, permite enumerar txids.

### 🟡 Média — Exposição do gateway
O nome do gateway e o merchant estão expostos. Um concorrente pode identificar o provedor de pagamento.

### 🟢 Baixa — Polling sem timeout máximo
O frontend faz polling a cada 5s sem um limite máximo de tentativas visível.

---

## 5. DADOS COMPLETOS DO DEPÓSITO GERADO

```
=== QR CODE PIX (Base64 - PNG) ===
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEs... (QR Code de 192x192px)

=== CÓDIGO COPIA E COLA ===
00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/68e1ab09-9586-4697-9783-7fd91d0d833b5204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***63048546

=== TXID ===
B38DCAE0C15649278B5F2DF8

=== GATEWAY ===
amplopay

=== EXPIRA ===
30 minutos

=== VALOR ===
R$ 20,00
```
