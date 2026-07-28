# Backend — Checklist de Coluna do Paciente

API responsável por armazenar, com segurança, as respostas do checklist de
Sinais de Alerta e Autoavaliação preenchido pelos pacientes.

## O que este backend já faz

- Guarda nome, e-mail, telefone e respostas **criptografados em repouso**
  (AES-256-GCM) no banco de dados — mesmo quem tem acesso direto ao banco não
  lê os dados em texto puro.
- Login da equipe com **senha em hash** (bcrypt) e sessão por **JWT** de curta
  duração (8h).
- Cada paciente recebe um **token próprio** ao iniciar o checklist, usado para
  ele mesmo consultar ou apagar seus dados depois (direitos do titular,
  LGPD art. 18).
- **Registro de auditoria** (quem acessou o quê e quando).
- Limite de tentativas de login, para dificultar ataques de força bruta.

## O que este backend NÃO faz sozinho (você ainda precisa cuidar disso)

Ter um backend com criptografia não torna, por si só, um projeto "compliant"
com a LGPD. Isso é uma questão jurídica e organizacional, não só técnica.
Antes de usar isto com pacientes reais, é necessário:

1. **Designar um encarregado de dados (DPO)** e ter uma política de
   privacidade publicada, explicando o que é coletado e por quê.
2. **Definir uma base legal** para tratar dados de saúde (geralmente
   consentimento explícito e específico — este app já coleta esse
   consentimento, mas o texto jurídico deve ser revisado por um advogado).
3. **Definir prazo de retenção** dos dados e um processo real para
   exclusão/anonimização depois desse prazo.
4. **Registrar as atividades de tratamento** (ROPA) e, dependendo do volume,
   fazer um Relatório de Impacto à Proteção de Dados (RIPD).
5. Garantir que o **hosting do banco de dados** também segue boas práticas de
   segurança (backups criptografados, acesso restrito, etc.).
6. Ter um **plano de resposta a incidentes** (o que fazer em caso de
   vazamento).

Recomendo fortemente revisar esse projeto com um advogado especializado em
proteção de dados de saúde antes de publicá-lo para pacientes reais.

## Como rodar localmente

```bash
cd backend
npm install
cp .env.example .env
# edite o .env com suas credenciais reais (veja como gerar os segredos nos comentários do arquivo)
npm start
```

Depois, crie o primeiro usuário da equipe:

```bash
npm run create-admin -- nome.usuario "uma-senha-forte-aqui"
```

## Como colocar em produção (sem servidor próprio)

Qualquer uma dessas opções funciona bem para este projeto, todas com plano
gratuito ou de baixo custo:

1. **Banco de dados PostgreSQL gerenciado**: crie um banco em
   [Supabase](https://supabase.com), [Neon](https://neon.tech) ou
   [Railway](https://railway.app). Copie a "connection string" para
   `DATABASE_URL` no `.env`.
2. **Hospedagem da API**: suba esta pasta `backend/` em
   [Render](https://render.com) ou [Railway](https://railway.app) como
   "Web Service" Node.js. Configure as mesmas variáveis do `.env` no painel
   do serviço (nunca coloque o `.env` real no controle de versão / GitHub).
3. Depois de publicado, rode o comando `create-admin` uma vez (via o console
   do próprio provedor, ou rodando localmente apontando `DATABASE_URL` para o
   banco de produção).
4. No arquivo do app (`checklist-coluna-paciente.html`), troque a constante
   `API_BASE_URL` pela URL pública da API (ex.:
   `https://sua-api.onrender.com`).
5. Configure `ALLOWED_ORIGIN` no backend com o domínio real onde o app HTML
   vai ficar hospedado, para bloquear chamadas de outros sites.

## Endpoints

| Método | Rota | Quem usa | Descrição |
|---|---|---|---|
| POST | `/api/submissions` | Paciente | Cria o registro inicial (nome, e-mail, telefone, consentimento) |
| PATCH | `/api/submissions/:id` | Paciente (com seu token) | Atualiza respostas de cada etapa |
| GET | `/api/submissions/:id` | Paciente (com seu token) | Consulta seus próprios dados |
| DELETE | `/api/submissions/:id` | Paciente (com seu token) | Apaga seus próprios dados |
| POST | `/api/admin/login` | Equipe | Login, retorna token de sessão |
| GET | `/api/admin/submissions` | Equipe (autenticada) | Lista todas as respostas |
| GET | `/api/admin/submissions/:id` | Equipe (autenticada) | Detalhe de uma resposta |
| DELETE | `/api/admin/submissions/:id` | Equipe (autenticada) | Apaga qualquer registro |
