document.getElementById('form-candidato').addEventListener('submit', function(e) {
    e.preventDefault();

    const formData = new FormData(this);

    fetch('/candidaturas', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`Erro ${response.status}: ${text}`);
            });
        }
        return response.text();
    })
    .then(data => {
        alert('Candidatura enviada com sucesso! Entraremos em contato via e-mail a cada novidade.');
        this.reset();
    })
    .catch(error => {
        console.error('Erro:', error);
        alert(`Houve um problema ao enviar sua candidatura: ${error.message}. Tente novamente.`);
    });
});

function toggleMenu() {
    const menu = document.querySelector('.menu');
    menu.classList.toggle('active');
}