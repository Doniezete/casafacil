import { http } from '@google-cloud/functions-framework';

const LABEL_TIPO_CLIENTE = {
  lead_novo: 'Lead novo (primeiro contato / ainda não fechou)',
  cliente_ativo: 'Cliente já adquirido (contrato em andamento)'
};
const LABEL_ETAPA = {
  primeiro_contato: 'Primeiro contato',
  negociando: 'Negociando valores',
  documentacao: 'Reunindo documentação',
  aguardando_aprovacao: 'Aguardando aprovação da Caixa',
  aprovado: 'Aprovado / assinando contrato',
  obra: 'Obra em andamento',
  entregue: 'Entregue / concluído'
};
const LABEL_OBJECAO = {
  sem_objecao: 'Sem objeção',
  entrada: 'Valor da entrada',
  renda: 'Renda insuficiente / não comprova renda',
  documentacao: 'Falta de documentação',
  prazo_obra: 'Receio com prazo de obra',
  concorrencia: 'Comparando com outra proposta/concorrente'
};
const LABEL_ORIGEM = {
  indicacao: 'Indicação',
  jardim_ranzani: 'Jardim Ranzani (loteamento)',
  redes_sociais: 'Redes sociais / WhatsApp',
  contato_antigo: 'Contato antigo que retornou',
  outro: 'Outro'
};

function montarPromptIndividual(resumo, lead, historico) {
  const d = lead || {};
  const hist = Array.isArray(historico) ? historico.slice(-6) : []; // ultimos 6 atendimentos, mais recente por ultimo

  let blocoHistorico = '(nenhum atendimento anterior registrado — este é o primeiro contato com este cliente)';
  if (hist.length > 0) {
    blocoHistorico = hist.map((h, i) => {
      const dataFmt = h.data || 'data não informada';
      return `Atendimento ${i + 1} de ${hist.length} (${dataFmt}):\n"""${h.resumo || ''}"""\n${h.sugestaoIA ? 'Sugestão dada na época: ' + h.sugestaoIA.slice(0, 300) : ''}`;
    }).join('\n\n');
  }

  return `Você é um assistente que ajuda um corretor de imóveis (financiamento MCMV, construção de casas em cidades pequenas do interior de SP) a decidir os próximos passos com um cliente.

Dados cadastrais:
- Nome: ${d.nome || 'não informado'}
- Renda informada: R$ ${d.renda || 0}
- Faixa MCMV: ${d.faixa || 'não informada'}
- Financiamento estimado: R$ ${d.financiamento || 0}
- Parcela estimada: R$ ${d.parcela || 0}
- Status atual: ${d.status || 'não informado'}
- Tipo de cliente: ${LABEL_TIPO_CLIENTE[d.tipoCliente] || 'não informado'}
- Etapa atual do processo: ${LABEL_ETAPA[d.etapa] || 'não informada'}
- Principal objeção neste contato: ${LABEL_OBJECAO[d.objecao] || 'não informada'}
- Como chegou até o corretor: ${LABEL_ORIGEM[d.origem] || 'não informado'}
- Anotações rápidas do corretor: ${d.notasAnteriores || '(nenhuma)'}

Histórico de atendimentos anteriores com este mesmo cliente, do mais antigo para o mais recente:
${blocoHistorico}

Resumo do atendimento de HOJE (o mais recente, escrito pelo corretor):
"""
${resumo}
"""

Com base em TUDO isso — principalmente notando como o cliente evoluiu desde os atendimentos anteriores, se houver — responda em português, de forma direta e prática, em 4 blocos curtos, com esses títulos exatos:

STATUS SUGERIDO: (quente / aguardando renda / esfriando / convertido) — e por quê, em uma frase.

VALE A PENA INSISTIR?: sim ou não, e por quê, em 1-2 frases.

PRÓXIMO PASSO: o que fazer e quando (seja específico com prazo, ex: "em 3 dias" ou "amanhã").

COMO ABORDAR: 1-2 frases com dica de como conduzir a próxima conversa, considerando o que já foi dito antes a este cliente específico (se houver histórico).

Seja objetivo, sem rodeios. Não invente informações que não foram dadas.`;
}

function montarPromptPerfilGlobal(stats) {
  const s = stats || {};
  return `Você é um consultor de marketing e vendas ajudando um corretor de imóveis (financiamento MCMV, construção de casas em cidades pequenas do interior de SP) a decidir onde investir tempo e dinheiro em divulgação.

Abaixo está um resumo agregado (números, não dados individuais) de todos os leads e clientes cadastrados no sistema dele até agora:

- Total de leads/clientes cadastrados: ${s.totalLeads ?? 'não informado'}
- Distribuição por status: ${JSON.stringify(s.porStatus || {})}
- Distribuição por origem (como chegaram até ele): ${JSON.stringify(s.porOrigem || {})}
- Distribuição por principal objeção enfrentada: ${JSON.stringify(s.porObjecao || {})}
- Distribuição por faixa MCMV: ${JSON.stringify(s.porFaixa || {})}
- Taxa de conversão por origem (convertidos / total daquela origem): ${JSON.stringify(s.conversaoPorOrigem || {})}
- Tempo médio (em dias) entre o primeiro contato e a conversão, quando disponível: ${s.tempoMedioConversaoDias ?? 'não disponível'}

Com base nesses números, responda em português, direto e prático, em blocos com esses títulos exatos:

ONDE INVESTIR EM DIVULGAÇÃO: quais origens/canais estão trazendo mais leads e, principalmente, mais conversão — vale a pena reforçar algum canal específico?

OBJEÇÃO MAIS FREQUENTE: qual é, e uma sugestão prática de como reduzir esse atrito (ex: ajuste de abordagem, material de apoio, tipo de brinde/ação para primeiro contato).

PERFIL QUE MAIS CONVERTE: com base nos dados, que tipo de lead (faixa, origem) merece atenção prioritária.

RESSALVA: se a base de dados ainda for pequena para conclusões confiáveis, diga isso claramente e recomende continuar coletando dados antes de tomar decisões grandes de investimento.

Seja objetivo. Não invente números que não foram dados — baseie-se só no que está no resumo agregado acima.`;
}

function montarPromptInterpretarTarefa(transcricao, dataHoje) {
  return `Hoje é ${dataHoje || 'data não informada'} (formato AAAA-MM-DD).

Uma pessoa gravou por voz o seguinte pedido de tarefa ou compromisso, transcrito automaticamente (pode ter pequenos erros de transcrição):
"""
${transcricao}
"""

Extraia dessa fala uma tarefa estruturada. Responda SOMENTE com um JSON válido, sem nenhum texto antes ou depois, sem markdown, exatamente neste formato:

{"titulo": "resumo curto e claro da tarefa, em poucas palavras", "data": "AAAA-MM-DD ou null se não for possível saber pela fala", "hora": "HH:MM ou null se não foi mencionado horário", "tipo": "tarefa"}

Regras:
- Interprete expressões relativas de data (amanhã, depois de amanhã, sexta-feira, semana que vem, daqui a X dias) com base na data de hoje informada acima.
- Se a fala mencionar claramente que é sobre ligar, mandar mensagem ou se reunir com alguém, use tipo "ligacao", "mensagem" ou "reuniao" respectivamente; caso contrário, use "tarefa".
- Se não conseguir identificar uma data, retorne "data": null — não invente uma data.
- O título deve ser um resumo objetivo do que precisa ser feito, não a fala inteira transcrita literalmente.`;
}

function montarPromptInterpretarEstoque(transcricao, itens, obras, dataHoje) {
  var listaItens = (itens||[]).map(function(i){ return i.id+' | '+i.nome+' | '+(i.un||''); }).join('\n');
  var listaObras = (obras||[]).map(function(o){ return o.id+' | '+o.nome+' | '+(o.obra||''); }).join('\n');
  return `Hoje é ${dataHoje || 'data não informada'}.

Uma pessoa gravou por voz ou digitou o seguinte pedido de retirada de materiais do estoque para uma obra:
"""
${transcricao}
"""

Catálogo de itens disponíveis no estoque (id | nome | unidade):
${listaItens}

Obras/clientes ativos (id | nome do cliente | descrição da obra):
${listaObras}

Extraia da fala: quais itens foram retirados (combine com o item mais parecido do catálogo acima, mesmo que a fala não bata palavra por palavra — ex: "joelho" pode ser "Joelho PVC Soldável 3/4"), a quantidade de cada item, e qual obra/cliente foi mencionado (combine com a lista de obras acima, geralmente pelo nome do cliente).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, sem markdown, exatamente neste formato:

{"obraId": "id da obra encontrada ou null se não identificar", "itens": [{"itemId": "id do item encontrado no catálogo ou null se não identificar", "textoOriginal": "o trecho da fala referente a esse item", "quantidade": numero}]}

Regras:
- Extraia TODOS os itens mencionados na fala, um por um.
- Se não conseguir identificar um item ou a obra com razoável confiança, use null nesse campo específico — nunca invente um id que não esteja nas listas acima.
- "quantidade" deve ser um número (não string).`;
}

http('analisarLead', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const { resumo, lead, historico, modo, stats, transcricao, dataHoje, itens, obras } = req.body || {};

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada nesta funcao.' });
      return;
    }

    let prompt;
    if (modo === 'perfil_global') {
      prompt = montarPromptPerfilGlobal(stats);
    } else if (modo === 'interpretar_tarefa') {
      if (!transcricao) {
        res.status(400).json({ error: 'Transcricao obrigatoria.' });
        return;
      }
      prompt = montarPromptInterpretarTarefa(transcricao, dataHoje);
    } else if (modo === 'interpretar_estoque') {
      if (!transcricao) {
        res.status(400).json({ error: 'Transcricao obrigatoria.' });
        return;
      }
      prompt = montarPromptInterpretarEstoque(transcricao, itens, obras, dataHoje);
    } else {
      if (!resumo) {
        res.status(400).json({ error: 'Resumo obrigatorio.' });
        return;
      }
      prompt = montarPromptIndividual(resumo, lead, historico);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: modo === 'perfil_global' ? 900 : (modo === 'interpretar_tarefa' ? 300 : (modo === 'interpretar_estoque' ? 700 : 600)),
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || 'Erro na API da IA.';
      res.status(500).json({ error: msg });
      return;
    }

    const texto = (data.content && data.content[0] && data.content[0].text) || 'Sem resposta.';

    if (modo === 'interpretar_tarefa') {
      try {
        const limpo = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
        const obj = JSON.parse(limpo);
        res.json({ titulo: obj.titulo || '', data: obj.data || null, hora: obj.hora || null, tipo: obj.tipo || 'tarefa' });
      } catch (e) {
        res.status(500).json({ error: 'Nao consegui entender a tarefa a partir da fala. Tente falar de novo com mais clareza.' });
      }
      return;
    }

    if (modo === 'interpretar_estoque') {
      try {
        const limpo = texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
        const obj = JSON.parse(limpo);
        res.json({ obraId: obj.obraId || null, itens: Array.isArray(obj.itens) ? obj.itens : [] });
      } catch (e) {
        res.status(500).json({ error: 'Nao consegui entender os itens a partir da fala. Tente falar de novo com mais clareza.' });
      }
      return;
    }

    res.json({ text: texto });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
