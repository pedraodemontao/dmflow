-- ---------------------------------------------------------------------------
-- Reel do MoneyPrinterTurbo: "comenta CHINA que eu te mando o passo a passo".
-- Cria a automação de comentário → DM com o link do material 27.
--
-- Rode DEPOIS de conectar a conta pelo botão "Conectar Instagram"
-- (a linha em public.accounts precisa existir).
--
-- IDEMPOTENTE: rodar de novo não duplica. Atualiza a definição do fluxo e
-- deixa o trigger existente em paz.
--
-- Sobre o spintax: a trava de variação (src/lib/flow/variation.ts) exige 3+
-- versões na resposta pública e 2+ em cada bloco de mensagem antes de a
-- automação poder ficar ativa. Os grupos aqui estão escritos com {{nome}}
-- FORA deles de propósito: a medição de pior caso em types.ts não mascara
-- variável, então spintax com {{nome}} dentro não colapsa e o texto é medido
-- inteiro. Do jeito que está, cada grupo multiplica de verdade:
-- entrega = 27 versões, aviso = 16, followup = 6, resposta pública = 4.
-- ---------------------------------------------------------------------------

do $$
declare
  v_account uuid;
  v_flow    uuid;
  v_name    text := 'Comentário CHINA → material 27';
  v_def     jsonb := '{
    "entry": "entrega",
    "nodes": {
      "entrega": {
        "type": "buttons",
        "text": "{Oi|E aí|Fala} {{nome}}! {Vi seu comentário|Chegou o seu comentário|Vi ali o seu comentário} 👋 {Tá aqui|Segue|Esse é} o material completo do MoneyPrinterTurbo: os quatro caminhos de instalação, o agente que instala sozinho e os prompts prontos pra copiar.",
        "buttons": [
          { "title": "Pegar o material", "url": "https://nocodepedro.site/27" }
        ],
        "next": "marca_lead"
      },
      "marca_lead": {
        "type": "tag",
        "add": ["lead-china", "material-27"],
        "next": "aviso"
      },
      "aviso": {
        "type": "message",
        "text": "{Duas coisas que salvam a sua tarde|Duas dicas antes de você instalar}: {pega a chave do Pexels antes de tudo, que é de graça|começa pegando a chave do Pexels, que é grátis}, e {escolhe uma voz pt-BR|usa uma voz em pt-BR}. Voz no idioma errado faz o vídeo sair mudo e {não dá erro nenhum|não avisa em lugar nenhum}.",
        "next": "espera"
      },
      "espera": {
        "type": "delay",
        "seconds": 72000,
        "next": "followup"
      },
      "followup": {
        "type": "message",
        "text": "{E aí, conseguiu gerar o primeiro vídeo?|Deu pra rodar o primeiro vídeo?|Conseguiu gerar o seu primeiro?} {Se travou em algum passo, me conta qual que eu te ajudo|Se empacou em alguma parte, me diz onde que eu te desempaco}.",
        "next": "fim"
      },
      "fim": { "type": "end" }
    }
  }'::jsonb;
begin
  select id into v_account from public.accounts order by created_at limit 1;

  if v_account is null then
    raise exception 'Nenhuma conta em public.accounts. Conecte o Instagram no painel antes de rodar isto.';
  end if;

  select id into v_flow
    from public.flows
   where account_id = v_account and name = v_name;

  if v_flow is null then
    insert into public.flows (account_id, name, is_active, definition)
    values (v_account, v_name, true, v_def)
    returning id into v_flow;
    raise notice 'Fluxo criado: %', v_flow;
  else
    update public.flows
       set definition = v_def,
           is_active  = true,
           updated_at = now()
     where id = v_flow;
    raise notice 'Fluxo já existia, definição atualizada: %', v_flow;
  end if;

  if not exists (
    select 1 from public.triggers
     where flow_id = v_flow and type = 'comment'
  ) then
    insert into public.triggers (
      account_id, flow_id, type, keywords, match_mode,
      media_id, public_reply, priority, is_active
    )
    values (
      v_account,
      v_flow,
      'comment',
      array['china'],
      'contains',
      -- media_id null = vale em qualquer post. Depois de publicar o reel,
      -- edite no painel e cole o id da mídia se você quiser que a palavra
      -- "china" fora daquele reel não dispare nada.
      null,
      '{Mandei no seu direct|Te respondi no privado|Já tá no seu direct|Acabei de te mandar no direct} 📩',
      20,
      true
    );
    raise notice 'Trigger de comentário criado para a palavra CHINA.';
  else
    raise notice 'Trigger de comentário já existia, nada mudou.';
  end if;
end $$;
