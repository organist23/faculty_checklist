
const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

const JSXParser = acorn.Parser.extend(jsx());

try {
  const code = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');
  JSXParser.parse(code, {
    sourceType: 'module',
    ecmaVersion: 'latest'
  });
  console.log('No syntax errors found');
} catch (e) {
  console.error('Syntax error:', e.message, 'at line', e.loc.line, 'col', e.loc.column);
}
