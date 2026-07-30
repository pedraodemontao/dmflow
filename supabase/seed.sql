-- Fluxo de exemplo: "comenta CHECKLIST no post que eu te mando no direct".
-- Rode DEPOIS de conectar a conta pelo botão "Conectar Instagram" (a linha em accounts precisa existir).

with account as (
  select id from public.accounts order by created_at limit 1
),

new_flow as (
  insert into public.flows (account_id, name, is_active, definition)
  select
    account.id,
    'Comentário → checklist',
    true,
    '{
      "entry": "abertura",
      "nodes": {
        "abertura": {
          "type": "message",
          "text": "Oi {{nome}}! Vi seu comentário 👋 Te mando o checklist agora. Só confirma pra eu liberar:",
          "quickReplies": [
            { "title": "Quero sim", "payload": "SIM" },
            { "title": "Agora não", "payload": "NAO" }
          ],
          "next": "espera_confirmacao"
        },
        "espera_confirmacao": {
          "type": "wait_reply",
          "saveAs": "resposta",
          "next": "checa_resposta"
        },
        "checa_resposta": {
          "type": "condition",
          "cases": [
            { "source": "last_input", "op": "contains", "value": "SIM", "next": "marca_lead" },
            { "source": "last_input", "op": "contains", "value": "quero", "next": "marca_lead" }
          ],
          "fallback": "desistiu"
        },
        "marca_lead": {
          "type": "tag",
          "add": ["lead-checklist"],
          "next": "entrega"
        },
        "entrega": {
          "type": "buttons",
          "text": "Show! Tá aqui o checklist completo 👇",
          "buttons": [
            { "title": "Baixar checklist", "url": "https://exemplo.com/checklist" }
          ],
          "next": "espera_um_dia"
        },
        "espera_um_dia": {
          "type": "delay",
          "seconds": 72000,
          "next": "followup"
        },
        "followup": {
          "type": "message",
          "text": "E aí, conseguiu aplicar o checklist? Me conta em que passo você travou que eu te ajudo.",
          "next": "fim"
        },
        "desistiu": {
          "type": "message",
          "text": "Tranquilo! Se mudar de ideia é só me chamar aqui.",
          "next": "fim"
        },
        "fim": { "type": "end" }
      }
    }'::jsonb
  from account
  returning id, account_id
)

insert into public.triggers (account_id, flow_id, type, keywords, match_mode, public_reply, priority)
select
  new_flow.account_id,
  new_flow.id,
  'comment',
  array['checklist', 'eu quero', 'quero'],
  'contains',
  'Mandei no seu direct! 📩',
  10
from new_flow;
