# Projeto de Dashboards Interativos (HTML + PostgreSQL)

Este pacote inclui:

- **Frontend HTML/CSS/JS** com dois dashboards:
  - Dashboard Executivo / Operacional
  - Dashboard Técnico / Projetos
- **Backend Flask** com API REST para leitura do PostgreSQL
- **Base de dados de testes PostgreSQL** com esquema e dados de exemplo
- **Docker Compose** para subir PostgreSQL + API localmente

## Estrutura

- `frontend/`
  - `index.html`
  - `styles.css`
  - `app.js`
- `backend/`
  - `app.py`
  - `requirements.txt`
- `database/`
  - `01_schema.sql`
  - `02_seed.sql`
- `docker-compose.yml`
- `.env.example`

## Como executar

### Opção recomendada: Docker

1. Copie `.env.example` para `.env`
2. Ajuste, se necessário, utilizador/password/database
3. Na pasta do projeto execute:

```bash
docker compose up --build
```

4. Aceda:
- Frontend: `http://localhost:8080`
- API: `http://localhost:5000`
- PostgreSQL: porta `5432`

### Opção manual

#### Base de dados
Crie a base de dados e execute:
- `database/01_schema.sql`
- `database/02_seed.sql`

#### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

#### Frontend
Sirva a pasta `frontend` com qualquer servidor HTTP simples:
```bash
cd frontend
python -m http.server 8080
```

## Nota técnica importante

O navegador **não deve ligar-se diretamente ao PostgreSQL**.  
A arquitetura correta é:

**HTML Dashboard -> API Backend -> PostgreSQL**

Isto evita expor credenciais da base de dados no browser e permite controlo de segurança, paginação, regras de negócio e auditoria.

## Funcionalidades incluídas

### Dashboard Executivo
- KPIs:
  - Faturação Total
  - Nº de Encomendas
  - Taxa de Faturação
  - Encomendas em Atraso
  - Nº de Clientes
- Gráficos:
  - Evolução da Faturação
  - Faturação por Estado
  - Top Clientes
  - Funil de Encomendas
  - Tabela de exceções

### Dashboard Técnico
- KPIs:
  - Projetos Ativos
  - Projetos em Risco
  - SLA Cumprido
  - Backlog Total
- Gráficos:
  - Projetos por Estado
  - Real vs Previsto
  - Backlog por Técnico
  - Motivos de Atraso
  - Tabela de projetos em risco

## Personalização

No ficheiro `frontend/app.js`, pode:
- alterar textos
- mudar cores
- ajustar filtros
- apontar para outro URL da API

No backend (`backend/app.py`) pode:
- adaptar SQL às tabelas reais do cliente
- substituir as views / queries de teste
- criar autenticação
- adicionar permissões por perfil
