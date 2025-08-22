const express = require('express');
const app = express();
const PORT = process.env.PORT || 4000;
app.get('/api/ping', (req, res) => {
res.json({ message: 'pong', time: new Date().toISOString() });
});
app.get('/', (req, res) => {
res.send('<h1>Cook Cook API</h1><p>Visit /api/ping</p>');
});
app.listen(PORT, () => {
console.log(`Server running on http://localhost:${PORT}`);
});