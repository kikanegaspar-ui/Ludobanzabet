from flask import Flask, render_template, jsonify

app = Flask(__name__)

SCENARIOS = [
    {
        "label": "Cenário Base",
        "tag": "CONSERVADOR",
        "color": "#4F6EF7",
        "jogos": 100,
        "valor_medio": 5000,
        "receita_diaria": 75000,
        "receita_mensal": 2250000,
    },
    {
        "label": "Crescimento",
        "tag": "MODERADO",
        "color": "#8B5CF6",
        "jogos": 500,
        "valor_medio": 10000,
        "receita_diaria": 750000,
        "receita_mensal": 22500000,
    },
    {
        "label": "Escala Total",
        "tag": "AMBICIOSO",
        "color": "#06B6D4",
        "jogos": 1000,
        "valor_medio": 10000,
        "receita_diaria": 1500000,
        "receita_mensal": 45000000,
    },
]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/scenarios")
def scenarios():
    return jsonify(SCENARIOS)

@app.route("/api/stats")
def stats():
    return jsonify({
        "market_growth": "+40%",
        "mobile_users": "12M+",
        "africa_rank": "3º",
        "fee": "15%",
        "max_monthly": "45.000.000 Kz",
        "roi_months": "12–18",
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
