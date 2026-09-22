// Roda na SUA máquina, nunca aqui comigo. Precisa da chave secreta (service_role),
// que fica só na sua variável de ambiente — eu nunca vejo esse valor.
//
// Uso:
//   1) Copie scripts/pessoas-emails.example.json para scripts/pessoas-emails.local.json
//      e preencha nome+e-mail de cada pessoa (esse arquivo .local.json não vai para o Git).
//   2) Instale a dependência uma vez: npm install @supabase/supabase-js
//   3) No PowerShell:
//        $env:SUPABASE_SERVICE_ROLE_KEY = "sua-chave-aqui"
//        node scripts/convidar-contas.js
//      (pegue a chave em: painel do Supabase → Project Settings → API → service_role)
//
// O que o script faz: para cada pessoa, chama a mesma função que o botão
// "Invite" do painel do Supabase usa (supabase.auth.admin.inviteUserByEmail).
// Isso cria a conta e dispara, para o e-mail dela, a mensagem padrão do
// Supabase para criar a própria senha. Já convidados são reportados, não
// dão erro (idempotente — pode rodar de novo sem problema).
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mfsyrsegkvjmefcdaegh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY antes de rodar (veja as instruções no topo deste arquivo).');
  process.exit(1);
}

const file = path.join(__dirname, 'pessoas-emails.local.json');
if (!fs.existsSync(file)) {
  console.error('Crie ' + file + ' (copie pessoas-emails.example.json e preencha nome+email de cada pessoa).');
  process.exit(1);
}
const pessoas = JSON.parse(fs.readFileSync(file, 'utf8'));

const sb = createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  for (const { nome, email } of pessoas) {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { data: { nome } });
    if (error) console.log(`FALHOU  ${nome} <${email}>: ${error.message}`);
    else console.log(`OK      ${nome} <${email}>  id=${data.user.id}`);
  }
  console.log('\nPronto. Cada pessoa recebe um e-mail do Supabase para criar a própria senha.');
  console.log('Se algum e-mail não chegar, dá para reenviar pelo painel do Supabase (Authentication → Users).');
})();
