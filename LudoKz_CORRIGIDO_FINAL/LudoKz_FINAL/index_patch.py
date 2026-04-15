"""
index_patch.py — Aplica o patch ao templates/index.html do LudoKz
Executar na raiz do projecto: python3 index_patch.py
"""
import re, sys, os

target = 'templates/index.html'
if not os.path.exists(target):
    print(f"❌ Ficheiro {target} não encontrado. Corre este script na raiz do projecto.")
    sys.exit(1)

with open(target, 'r', encoding='utf-8') as f:
    html = f.read()

original_len = len(html)
changes = []

# ── 1. Substituir #s-game (canvas antigo) por wrapper vazio ──────────────────
# Regex flexível que apanha o bloco inteiro do GAME screen
pattern_game = re.compile(
    r'<!-- GAME.*?-->\s*<div id="s-game"[^>]*>.*?(?=\n\s*</div>\s*\n\s*<!-- GAME OVER)',
    re.DOTALL
)
new_sgame = (
    '<!-- GAME — tabuleiro injectado pelo ludo_board_v2.js -->\n'
    '  <div id="s-game" class="screen z" style="flex-direction:column;padding:0;min-height:100vh">'
)
if pattern_game.search(html):
    html = pattern_game.sub(new_sgame, html)
    changes.append("✅ #s-game substituído")
else:
    # Fallback: substituição directa pelo id
    pattern2 = re.compile(r'<div id="s-game" class="screen z"[^>]*>.*?(?=\n\s*</div>\s*\n\s*<!-- GAME OVER)', re.DOTALL)
    if pattern2.search(html):
        html = pattern2.sub(new_sgame, html)
        changes.append("✅ #s-game substituído (fallback)")
    else:
        changes.append("⚠️  #s-game não encontrado automaticamente — verificar manualmente")

# ── 2. Remover scripts Godot ─────────────────────────────────────────────────
for script in ['godot_bridge.js', 'ludo_game/index.js', 'ludo_game.js']:
    before = len(html)
    html = re.sub(rf'\s*<script src="/static/{re.escape(script)}"></script>', '', html)
    if len(html) != before:
        changes.append(f"✅ {script} removido")

# ── 3. Garantir ludo_board_v2.js antes de game_patch.js ─────────────────────
if '/static/ludo_board_v2.js' not in html:
    old = '<script src="/static/game_patch.js"></script>'
    new = '<script src="/static/ludo_board_v2.js"></script>\n<script src="/static/game_patch.js"></script>'
    if old in html:
        html = html.replace(old, new)
        changes.append("✅ ludo_board_v2.js adicionado antes de game_patch.js")
    else:
        # Adicionar antes do </body>
        html = html.replace('</body>', '<script src="/static/ludo_board_v2.js"></script>\n</body>')
        changes.append("✅ ludo_board_v2.js adicionado antes de </body>")
else:
    changes.append("✅ ludo_board_v2.js já presente")

# ── 4. Corrigir referência ao #ludo-canvas → #ludo-svg (se existir) ──────────
if 'ludo-canvas' in html:
    html = html.replace('ludo-canvas', 'ludo-svg')
    changes.append("✅ Referências ludo-canvas → ludo-svg actualizadas")

# ── 5. Remover #dfc (dice face antiga) se duplicada ─────────────────────────
# O board_v2.js usa #dice-3d; o index pode ter #dfc que conflitua
# Mantemos #dfc como alias para compatibilidade — não remover

# ── Escrever resultado ────────────────────────────────────────────────────────
with open(target, 'w', encoding='utf-8') as f:
    f.write(html)

print("\n".join(changes))
delta = len(html) - original_len
print(f"\n✅ {target} actualizado ({original_len}→{len(html)} bytes, Δ{delta:+d})")
