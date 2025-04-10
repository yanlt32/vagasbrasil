document.getElementById('form-candidato').addEventListener('submit', function(e) {
    e.preventDefault();

    const formData = new FormData(this); // Pega todos os campos do formulário automaticamente

    fetch('http://localhost:3000/candidaturas', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro ao enviar candidatura');
        }
        return response.text();
    })
    .then(data => {
        alert('Candidatura enviada com sucesso! Entraremos em contato via e-mail a cada novidade.');
        this.reset();
    })
    .catch(error => {
        console.error('Erro:', error);
        alert('Houve um problema ao enviar sua candidatura. Tente novamente.');
    });
});

function toggleMenu() {
    const menu = document.querySelector('.menu');
    menu.classList.toggle('active');
}