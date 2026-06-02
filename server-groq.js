import express from 'express';
import fs from 'fs';

const app = express();
app.use(express.json());

// CORS habilitado
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
    if (!fs.existsSync(USAGE_FILE)) {
        fs.writeFileSync(USAGE_FILE, '{}');
    }
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
        return `O sermão tem duração de ${duracao}. Crie um esboço MUITO CURTO: 1 ponto principal, introdução de 2 linhas, conclusão de 2 linhas. Total: 200-300 palavras.`;
    } else if (min <= 10) {
        return `O sermão tem duração de ${duracao}. Crie um esboço CURTO: 2 pontos principais, introdução breve, conclusão breve. Total: 300-450 palavras.`;
    } else if (min <= 15) {
        return `O sermão tem duração de ${duracao}. Crie um esboço CONCISO: 2-3 pontos principais com 2 subpontos cada. Total: 450-600 palavras.`;
    } else if (min <= 20) {
        return `O sermão tem duração de ${duracao}. Crie um esboço MÉDIO: 3 pontos com subpontos, 1 ilustração, aplicação prática. Total: 600-800 palavras.`;
    } else if (min <= 30) {
        return `O sermão tem duração de ${duracao}. Crie um esboço COMPLETO: 3-4 pontos detalhados, 2 ilustrações, aplicações práticas, conclusão com chamada à ação. Total: 900-1200 palavras.`;
    } else if (min <= 45) {
        return `O sermão tem duração de ${duracao}. Crie um esboço DETALHADO: 4-5 pontos com subpontos, 3-4 histórias/ilustrações, aplicações práticas, perguntas reflexivas. Total: 1400-1800 palavras.`;
    } else {
        return `O sermão tem duração de ${duracao}. Crie um esboço MUITO COMPLETO E EXTENSO: 5-6 pontos principais com 4-5 subpontos cada, 5-6 histórias/ilustrações, referências cruzadas bíblicas, aplicações detalhadas, momentos de oração sugeridos, conclusão poderosa. Total: 2000-2800 palavras.`;
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

        const prompt = `Você é um assistente especializado em criar esboços de sermões para pastores e líderes cristãos evangélicos brasileiros.

Crie um esboço de sermão com as seguintes especificações:

TEMA: ${tema}
${versiculo ? `VERSÍCULO BASE: ${versiculo}` : ''}
PÚBLICO-ALVO: ${publico}
${tamanhoInstrucoes}
${contexto ? `CONTEXTO ADICIONAL: ${contexto}` : ''}

ESTRUTURA:
1. Título criativo e impactante
2. Versículo(s) base
3. Introdução
4. Pontos principais numerados
5. Conclusão com chamada à ação

IMPORTANTE:
- Escreva em português brasileiro
- Use linguagem adequada ao público (${publico})
- Seja fiel às escrituras evangélicas
- Respeite RIGOROSAMENTE o tamanho especificado
- Um sermão de 5 minutos deve ser MUITO mais curto que um de 1 hora`;

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
            console.error('Groq API error:', errorData);
            return res.status(500).json({ error: 'Erro na API Groq: ' + (errorData.error?.message || 'Erro desconhecido') });
        }

        const data = await response.json();
        const esbocoGerado = data.choices[0].message.content;

        incrementUserUsage(userId);

        res.json({
            esboço: esbocoGerado,
            usage: usage + 1,
            limit: 50
        });

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'Sermão Pronto API funcionando',
        model: 'llama-3.3-70b-versatile',
        plan: 'GRATUITO: Groq free tier'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Sermão Pronto Backend' });
});

app.listen(PORT, () => {
    console.log(`\n📖 SERMÃO PRONTO BACKEND`);
    console.log(`✅ Endpoints:`);
    console.log(`   POST http://localhost:${PORT}/api/gerar        - Gerar esboço (Groq)`);
    console.log(`   GET  http://localhost:${PORT}/api/status       - Status do serviço`);
    console.log(`   GET  http://localhost:${PORT}/health           - Health check`);
    console.log(`\n🔥 GRATUITO: Groq free tier`);
    console.log(`⚡ Modelo: Llama 3.3 70B (poderoso e confiável)\n`);
});
