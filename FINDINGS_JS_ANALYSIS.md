# Análise Adicional dos Bundles JS

## Novos Endpoints Descobertos

### Rota do Jogo
- `/jogar?valor={amount}&auto=1&mapa={map}` — Página do jogo com parâmetros

### Alteração de Senha
- Endpoint: `POST /api/user/senha`
- Campos exatos: `senha_atual`, `nova_senha` (min 6 chars), `confirmar_nova_senha`
- Retorno: `{ success, data/message, error }`

### Depósito
- Endpoint: `POST /api/financeiro/deposito`
- Corpo: `{ valor, cpf?, aceitar_bonus_deposito? }`
- Bônus: verifica `bonus_deposito.ativo`, `percentual`, `minimo`, `maximo`
- Polling: `/api/financeiro/deposito/status/{txid}` a cada 5s

### Depósito Info
- Endpoint: `GET /api/user/deposito-info?t={timestamp}`
- Retorna: `valores_rapidos`, `limites`, `bonus_deposito`, `botoes_labels`, `botoes_cores`

### Saque
- Endpoint: `POST /api/financeiro/saque`
- Corpo: `{ valor, chave_pix, cpf }`
- Taxa: `taxas_saque.jogador_valor` (se `taxas_saque.jogador_ativa`)

### Comissões (Indicação)
- Endpoint: `GET /api/indicacao/comissoes?limite={n}` (default 500)
- Retorno: `comissoes: [{ nivel, indicado_nome, valor_deposito, valor, created_at }]`

## Vulnerabilidades Adicionais

### V13 — Depósito Info Pode Expor Configurações Financeiras Sensíveis
O endpoint `/api/user/deposito-info` retorna `limites.deposito_minimo`, `botoes_labels/cores`, `taxas_saque` — possivelmente expondo a estrutura financeira interna.

### V14 — Valor do Jogo Passado na URL
A rota `/jogar?valor={amount}&auto=1` passa o valor da aposta na URL. Qualquer script no navegador ou extensão pode interceptar esses dados.

### V15 — CPF Enviado Como String Opcional no Depósito
O campo `cpf` é opcional no depósito. Se enviado, pode estar sendo armazenado sem criptografia adequada.

### V16 — Taxa de Saque Configurável por Tipo de Usuário
O código mostra `taxas_saque.jogador_valor` e `taxas_saque.jogador_ativa`, sugerindo que taxas diferentes podem ser configuradas por tipo de usuário, o que pode ser manipulado.

## Observações de Código

1. O jogo é carregado via no painel via lazy load: `Promise.resolve().then(() => require(7254))`
2. A função de formatação de valor: `w(e) = "R$ " + Number(e || 0).toLocaleString("pt-BR", { minFrac: 2, maxFrac: 2 })`
3. Os valores de entrada rápida vêm do servidor via `configs().entrada_valores_rapidos`
4. Os mapas disponíveis têm cores customizadas por time (pipe colors + sky colors)
5. O jogo é servido via RSC (React Server Components) no Next.js

## Ação do Game Endpoint

### POST /api/flappybird/iniciar
- Body esperado: `{ valor: number, mapa: string }`
- Body alternativo (via RSC): `{ valor: number, mapa: string, tipo?: "demo" }`

### POST /api/flappybird/finalizar
- Body esperado: `{ partida_id: string, canos: number, pontuacao: number }`
