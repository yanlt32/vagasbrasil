// Função para carregar as vagas do servidor
function carregarVagas() {
    fetch('http://localhost:3000/vagas')
        .then(response => {
            if (!response.ok) {
                throw new Error('Erro ao carregar vagas');
            }
            return response.json();
        })
        .then(vagas => {
            vagas.forEach(vaga => adicionarVagaNaLista(vaga));
        })
        .catch(error => {
            console.error('Erro:', error);
            alert('Houve um problema ao carregar as vagas.');
        });
}

// Função para adicionar uma vaga à lista na interface
function adicionarVagaNaLista(vaga) {
    const lista = document.getElementById('lista-vagas');
    const div = document.createElement('div');
    div.innerHTML = `
        <h3>${vaga.titulo}</h3>
        <p><strong>Empresa:</strong> ${vaga.empresa}</p>
        <p><strong>Localização:</strong> ${vaga.localizacao}</p>
        <p><strong>Salário:</strong> ${vaga.salario || 'Não informado'}</p>
        <p>${vaga.descricao}</p>
        <hr>
    `;
    lista.appendChild(div);
}

// Carregar as vagas ao iniciar a página
window.onload = carregarVagas;

// Lidar com o envio do formulário
document.getElementById('form-vaga').addEventListener('submit', function(e) {
    e.preventDefault();

    const vaga = {
        titulo: document.getElementById('titulo').value,
        empresa: document.getElementById('empresa').value,
        localizacao: document.getElementById('localizacao').value,
        salario: document.getElementById('salario').value,
        descricao: document.getElementById('descricao').value
    };

    fetch('http://localhost:3000/vagas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vaga)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro ao cadastrar vaga');
        }
        return response.text();
    })
    .then(data => {
        console.log(data);
        alert('Vaga cadastrada com sucesso! Você receberá uma confirmação no Telegram.');
        adicionarVagaNaLista(vaga); // Adiciona a nova vaga à lista
        this.reset(); // Limpa o formulário
    })
    .catch(error => {
        console.error('Erro:', error);
        alert('Houve um problema ao cadastrar a vaga. Tente novamente.');
    });
});