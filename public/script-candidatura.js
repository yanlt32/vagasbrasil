document.getElementById('form-candidato').addEventListener('submit', function(e) {
    e.preventDefault();

    const formData = new FormData(this);

    fetch('https://seu-backend.onrender.com/candidaturas', {
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
