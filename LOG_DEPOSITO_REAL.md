# LOG COMPLETO — Depósito PIX Real (R$ 20,00)

**Data/hora:** 25/06/2026 ~11:25 BRT  
**TxID:** 351878B9836A4C44A6D9B941  
**Gateway:** amplopay  
**Merchant:** SGC INTERMEDIACOES  
**Status:** ✅ APROVADO  

---

## Timeline

| Tempo | Evento |
|-------|--------|
| T+0s | QR Code PIX gerado e exibido na tela |
| T+0.7s | Poll 1: `pendente` — saldo R$ 0,00 |
| T+4.3s | Poll 2: `pendente` — saldo R$ 0,00 |
| T+7.9s | Poll 3: `pendente` — saldo R$ 0,00 |
| T+11.6s | Poll 4: `pendente` — saldo R$ 0,00 |
| T+15.8s | Poll 5: `pendente` — saldo R$ 0,00 |
| T+19.5s | Poll 6: `pendente` — saldo R$ 0,00 |
| T+23.3s | Poll 7: `pendente` — saldo R$ 0,00 |
| T+27.8s | Poll 8: `pendente` — saldo R$ 0,00 |
| T+31.9s | Poll 9: `pendente` — saldo R$ 0,00 |
| T+35.7s | Poll 10: `pendente` — saldo R$ 0,00 |
| T+39.4s | Poll 11: `pendente` — saldo R$ 0,00 |
| **T+43.3s** | **Poll 12: `aprovado` — saldo R$ 20,00** |

**Tempo total até confirmação:** ~43 segundos  
**Polling usado:** a cada ~3.6s (frequência real)

---

## Dados da API

### POST /api/financeiro/deposito
```json
// Request
{ "valor": 20, "cpf": null, "aceitar_bonus_deposito": false }

// Response (200 OK)
{
  "txid": "351878B9836A4C44A6D9B941",
  "valor": 20,
  "qrcode_imagem": "data:image/png;base64,...",
  "qrcode_texto": "00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/da00a8c2-d40b-46c4-b18e-360887c72cd85204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***63048664",
  "gateway": "amplopay",
  "expiracao_minutos": 30,
  "instrucao": "Escaneie o QR Code ou use o código copia e cola para pagar."
}
```

### Polling GET /api/financeiro/deposito/status/{txid}
```json
// Enquanto pendente (T+0s a T+39.4s)
{ "status": "pendente", "valor": 20, "saldo_novo": 0, "valor_bonus": 0, "valor_creditado_total": 20, "bonus_rollover_multiplicador": 0 }

// Quando aprovado (T+43.3s)
{ "status": "aprovado", "valor": 20, "saldo_novo": 20, "valor_bonus": 0, "valor_creditado_total": 20, "bonus_rollover_multiplicador": 0 }
```

### Dashboard pós-depósito
```json
{ "saldo": 20, "saldo_afiliado": 0, "total_partidas": 0, "vitorias": 0, "recorde_canos": 0 }
```

---

## Fluxo do Gateway

O gateway **amplopay** funciona assim:
1. Servidor do Flap Copa chama API do amplopay com valor + identificador
2. amplopay retorna: QR Code (imagem base64) + código copia e cola + URL do PIX
3. Servidor repassa ao frontend, que exibe pro usuário
4. Usuário paga usando qualquer banco (copia e cola)
5. amplopay detecta o pagamento e envia **webhook** para o servidor do Flap Copa
6. Servidor atualiza saldo no banco de dados e muda status para "aprovado"
7. Frontend detecta "aprovado" no próximo poll e atualiza a interface

**Observação:** O webhook é totalmente server-side (não exposto ao frontend).

---

## QR Code PIX Gerado

**Código copia e cola:**
```
00020101021226820014br.gov.bcb.pix2560qrcode.a55scd.com.br/v1/da00a8c2-d40b-46c4-b18e-360887c72cd85204000053039865802BR5917SGCINTERMEDIACOES6008SAOPAULO62070503***63048664
```

**Decodificado:**
- Payload format: 01
- Merchant Account: `br.gov.bcb.pix`
- URL QR Code: `qrcode.a55scd.com.br/v1/da00a8c2-d40b-46c4-b18e-360887c72cd8`
- Merchant Category Code: 0000
- Transaction Currency: 986 (BRL)
- Country Code: BR
- Merchant Name: **SGCINTERMEDIACOES**
- Merchant City: **SAOPAULO**
- CRC16: 4866
