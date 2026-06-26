# Relatório de Vulnerabilidades — Flap Copa (canarinhodacopa.fun)

**Data:** 25/06/2026  
**Alvo:** https://canarinhodacopa.fun/  
**Tipo:** Next.js App (React) com API REST + PIX Gateway  
**Usuário logado:** habibes (ID: 131, tel: 21985395831)

---

## Sumário Executivo

Foram identificadas **10+ vulnerabilidades** no sistema, com níveis que variam de **Crítico** a **Baixo**.  
O sistema apresenta falhas de autenticação, exposição de dados sensíveis, falta de rate limiting, e possíveis brechas de injeção.

---

## 🔴 VULNERABILIDADES CRÍTICAS

### V1 — Endpoint Administrativo Exposto
**Localização:** `/api/admin/add-saldo` (POST)  
**Status:** Retorna 403 "Acesso negado"  
**Risco:** Mesmo bloqueado, o endpoint EXISTE e pode ser alvo de brute-force ou escalação de privilégio.  
**Evidência:** 
```
POST /api/admin/add-saldo → 403 {"error":"Acesso negado."}
```

### V2 — Registro de Usuário sem Validação Robusta
**Localização:** `/api/auth/register` (POST)  
**Status:** 201 Created  
**Risco:** Qualquer pessoa pode criar contas em massa. O sistema retorna JWT token imediatamente, sem verificação de SMS/email.  
**Payload usado:**
```json
{"nome":"teste","telefone":"21999999999","senha":"Teste1234","indicado_por":"ATFRX3"}
```
**Retorno:**
```json
{"token":"eyJ...","user":{"id":132,"nome":"teste","telefone":"21999999999","saldo":0,...}}
```

### V3 — JWT Token Exposto no localStorage sem Proteção CSRF
**Localização:** localStorage `flappix_token`  
**Token decodado:**
```json
{"userId":131,"tid":"cliente22","iat":1782396416,"exp":1783001216}
```
**Risco:** Token JWT armazenado sem httpOnly. Qualquer XSS permite roubo de sessão. Sem refresh token.

---

## 🟠 VULNERABILIDADES ALTAS

### V4 — API Pública sem Autenticação Expõe Configurações do Sistema
**Localização:** `/api/public/config?t={timestamp}` (GET — sem auth)  
**Risco:** Qualquer pessoa pode obter: depósito mínimo (R$20), promoções, links de suporte, status do teste grátis, configuração de popup.

### V5 — API do Jogo sem Autenticação Expõe Parâmetros Financeiros
**Localização:** `/api/flappybird/configs` (GET — sem auth)  
**Risco:** Expõe: multiplicador (10x), taxa por cano (R$0.20), min/max de aposta.

### V6 — Sistema de Cupons sem Proteção Contra Brute-Force
**Localização:** `/api/cupons/validar` (POST)  
**Risco:** Responde com mensagens específicas ("Cupom inválido ou inativo") que permitem ataque de dicionário. Sem rate limiting detectável.

### V7 — Depósito com Bônus Enviado pelo Cliente
**Localização:** `/api/financeiro/deposito` (POST)  
**Risco:** O flag `aceitar_bonus_deposito` é enviado pelo frontend. Servidor pode estar confiando em valor client-side.

---

## 🟡 VULNERABILIDADES MÉDIAS

### V8 — Saque Mínimo Validado Apenas no Servidor, Sem Limite por Período
**Localização:** `/api/financeiro/saque` (POST)  
**Evidência:** `"Saque mínimo: R$ 20.00"`  
**Risco:** Sem limite de frequência de saques no mesmo período detectado. Possível abuso se conta for comprometida.

### V9 — Alteração de Senha com Campos Obrigatórios Obscuros
**Localização:** `/api/user/senha` (PUT)  
**Risco:** Requer campos específicos não identificados na análise inicial. Múltiplos payloads testados retornam "Campos obrigatórios ausentes". Pode esconder validação fraca.

### V10 — Comissões de Indicação sem Paginação
**Localização:** `/api/indicacao/comissoes?limite={n}`  
**Risco:** O parâmetro `limite` é controlado pelo cliente, sem cap máximo visível. Possível DoS ou vazamento de dados.

---

## 🟢 VULNERABILIDADES BAIXAS

### V11 — Números Online Infláveis
Os números de "jogadores online" são gerados/atualizados via polling (`/api/public/config`). Não é possível determinar se os números são reais.

### V12 — PIX Gateway de Terceiros (Amplopay)
**Gateway:** `amplopay`  
**Risco:** Dependência de terceiro para processamento de pagamentos. QR Code é gerado pelo gateway, não pelo servidor local.

---

## 📋 ENDPOINTS MAPEADOS

| Endpoint | Método | Auth | Descrição |
|---|---|---|---|
| `/api/auth/login` | POST | — | Login |
| `/api/auth/register` | POST | — | Cadastro |
| `/api/auth/me` | GET | Bearer | Perfil do usuário |
| `/api/public/config` | GET | — | Configurações públicas |
| `/api/user/dashboard` | GET | Bearer | Dashboard do usuário |
| `/api/user/historico` | GET | Bearer | Histórico de partidas |
| `/api/user/senha` | PUT | Bearer | Alterar senha |
| `/api/financeiro/deposito` | POST | Bearer | Criar depósito PIX |
| `/api/financeiro/deposito/status/{txid}` | GET | Bearer | Status do depósito |
| `/api/financeiro/saque` | POST | Bearer | Solicitar saque |
| `/api/financeiro/saque-afiliado` | POST | Bearer | Saque afiliado |
| `/api/financeiro/meus-saques` | GET | Bearer | Listar saques |
| `/api/flappybird/configs` | GET | — | Configurações do jogo |
| `/api/flappybird/iniciar` | POST | Bearer | Iniciar partida |
| `/api/flappybird/finalizar` | POST | Bearer | Finalizar partida |
| `/api/cupons/validar` | POST | Bearer | Validar cupom |
| `/api/cupons/resgatar` | POST | Bearer | Resgatar cupom |
| `/api/indicacao/info` | GET | Bearer | Info de indicação |
| `/api/indicacao/rede` | GET | Bearer | Rede de indicação |
| `/api/indicacao/comissoes` | GET | Bearer | Histórico de comissões |
| `/api/admin/add-saldo` | POST | Bearer | **Admin:** Adicionar saldo |
| `/api/admin/usuarios` | GET | Bearer | **Admin:** Listar usuários |
| `/api/admin/balance` | GET | Bearer | **Admin:** Ver balanços |

---

## 🔧 TENTATIVAS DE EXPLORAÇÃO

### Cupons testados (todos inválidos/404):
- BEMVINDO, FLAPPIX, BONUS, PIX10, TESTE, WELCOME, VIP, PROMO, GANHE8, FLAP20, BEMVINDO10, PRIMEIRO, CADASTRO, DINHEIRO, START

### SQL Injection testada no cupom:
```
Payloads: ' OR '1'='1, ' UNION SELECT..., '; DROP TABLE..., admin'--, ' OR 1=1--
```
**Resultado:** Todos retornaram 404. Possível proteção básica.

### JWT Algorithm None Attack:
```json
{ alg: 'none', typ: 'JWT' } + { userId: 1, admin: true, role: 'admin' }
```
**Resultado:** 401/403. O servidor valida corretamente a assinatura JWT.

### Depósito com valor negativo: 400 "Valor inválido"
### Depósito com string: 500 "Erro ao gerar depósito"
### Depósito com valor mínimo (R$0.01): 400 "Depósito mínimo: R$ 20.00"

---

## 📊 DADOS DO USUÁRIO (habibes, ID 131)

- **Saldo:** R$ 0,00
- **Saldo afiliado:** R$ 0,00
- **Total de partidas:** 0
- **Código de indicação:** ATFRX3
- **Comissão nível 1:** 60%
- **Multiplicador do jogo:** 10x
- **Taxa por cano:** R$ 0,20
- **Depósito mínimo:** R$ 20
- **Aposta mínima:** R$ 3
- **Aposta máxima:** R$ 100

---

## ✅ RECOMENDAÇÕES

1. **Remover endpoints administrativos** que não são usados ou protegê-los com autenticação multifator
2. **Adicionar verificação de SMS/email** no cadastro
3. **Implementar httpOnly cookies** para o JWT token
4. **Rate limiting** em todos os endpoints (especialmente login, cupons, registro)
5. **Validação server-side** de bônus/descontos (não confiar no client)
6. **Bloquear criação de contas em massa** (CAPTCHA no cadastro)
7. **Política de senha forte** e limite de tentativas de login
8. **Registrar e auditar** todas as tentativas de acesso a endpoints admin
