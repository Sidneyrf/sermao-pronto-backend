import express from 'express';
import fs from 'fs';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const PORT = process.env.PORT || 3000;
const USAGE_FILE = 'users_usage.json';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    console.error('✗ Erro: GROQ_API_KEY não definida!');
    process.exit(1);
}

function loadData() {
    if (!fs.existsSync(USAGE_FILE)) fs.writeFileSync(USAGE_FILE, '{}');
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
}

function saveData(data) {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

function getMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function incrementUserUsage(userId) {
    const data = loadData();
    const monthKey = getMonthKey();
    const userKey = `${userId}_${monthKey}`;
    data[userKey] = (data[userKey] || 0) + 1;
    saveData(data);
    return data[userKey];
}

function getUserUsage(userId) {
    const data = loadData();
    const monthKey = getMonthKey();
    const userKey = `${userId}_${monthKey}`;
    return data[userKey] || 0;
}

function getTamanhoInstrucoes(duracao) {
    const min = parseInt(duracao);
    if (min <= 5) {
        return `Duração: ${duracao}. Esboço MUITO CURTO: 1 ponto principal com 1 ilustração curta. Introdução de 2 linhas. Conclusão de 2 linhas. Total: 200-300 palavras.`;
    } else if (min <= 10) {
        return `Duração: ${duracao}. Esboço CURTO: 2 pontos principais, cada um com 1 ilustração prática. Introdução breve. Conclusão breve. Total: 300-450 palavras.`;
    } else if (min <= 15) {
        return `Duração: ${duracao}. Esboço CONCISO: 2-3 pontos principais, cada um com 1 ilustração (história ou analogia). Total: 450-600 palavras.`;
    } else if (min <= 20) {
        return `Duração: ${duracao}. Esboço MÉDIO: 3 pontos com subpontos, cada ponto com 1 ilustração prática e 1 aplicação. Total: 600-800 palavras.`;
    } else if (min <= 30) {
        return `Duração: ${duracao}. Esboço COMPLETO: 3-4 pontos detalhados, cada ponto com 1-2 ilustrações (histórias reais, exemplos do cotidiano, analogias), aplicações práticas, conclusão com chamada à ação. Total: 900-1200 palavras.`;
    } else if (min <= 45) {
        return `Duração: ${duracao}. Esboço DETALHADO: 4-5 pontos com subpontos, cada ponto com 2 ilustrações ricas (histórias bíblicas, exemplos do dia a dia, analogias criativas), aplicações práticas, perguntas reflexivas. Total: 1400-1800 palavras.`;
    } else {
        return `Duração: ${duracao}. Esboço MUITO COMPLETO: 5-6 pontos com 4-5 subpontos cada, cada ponto com 2-3 ilustrações detalhadas (histórias bíblicas, casos reais, parábolas, analogias), referências cruzadas bíblicas, aplicações práticas detalhadas, momentos de oração, conclusão poderosa. Total: 2000-2800 palavras.`;
    }
}

app.post('/api/gerar', async (req, res) => {
    try {
        const { userId, tema, versiculo, publico, duracao, contexto } = req.body;

        if (!userId || !tema || !publico || !duracao) {
            return res.status(400).json({ error: 'Campos obrigatórios: userId, tema, publico, duracao' });
        }

        const usage = getUserUsage(userId);
        if (usage >= 50) {
            return res.status(429).json({ error: 'Limite mensal de 50 gerações atingido. Volte no próximo mês!' });
        }

        const tamanhoInstrucoes = getTamanhoInstrucoes(duracao);

        const prompt = `Você é um especialista em homilética evangélica brasileira, criando esboços de sermões para pastores e líderes cristãos.

Crie um esboço de sermão com estas especificações:

TEMA: ${tema}
${versiculo ? `VERSÍCULO BASE: ${versiculo}` : ''}
PÚBLICO-ALVO: ${publico}
${tamanhoInstrucoes}
${contexto ? `CONTEXTO ADICIONAL: ${contexto}` : ''}

ESTRUTURA OBRIGATÓRIA:
1. Título criativo e impactante
2. Versículo(s) base
3. Introdução envolvente
4. Pontos principais numerados (cada ponto DEVE ter):
   - Explicação bíblica
   - ILUSTRAÇÃO OBRIGATÓRIA (história real, exemplo do cotidiano, analogia ou caso prático)
   - Aplicação prática para a vida do ouvinte
5. Conclusão com chamada à ação

REGRAS:
- Escreva em português brasileiro
- Linguagem adequada ao público: ${publico}
- TODA ilustração deve ser concreta e relacionável (não genérica)
- Seja fiel às escrituras evangélicas
- Respeite RIGOROSAMENTE o tamanho especificado
- Sermão de 5 minutos é MUITO mais curto que de 1 hora`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(500).json({ error: 'Erro na API Groq: ' + (errorData.error?.message || 'Erro desconhecido') });
        }

        const data = await response.json();
        const esbocoGerado = data.choices[0].message.content;

        incrementUserUsage(userId);

        res.json({ esboço: esbocoGerado, usage: usage + 1, limit: 50 });

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: 'Erro interno: ' + error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'online', model: 'llama-3.3-70b-versatile', plan: 'Groq free tier' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Sermão Pronto Backend' });
});

app.listen(PORT, () => {
    console.log(`\n📖 SERMÃO PRONTO BACKEND`);
    console.log(`✅ Endpoints:`);
    console.log(`   POST http://localhost:${PORT}/api/gerar`);
    console.log(`   GET  http://localhost:${PORT}/api/status`);
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`\n🔥 GRATUITO: Groq free tier`);
    console.log(`⚡ Modelo: Llama 3.3 70B\n`);
});
