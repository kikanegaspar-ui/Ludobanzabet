from flask import Flask, render_template, jsonify, request, redirect, session

app = Flask(__name__)
app.secret_key = "ludobanzabet_secret_123"

ADMIN_USER = "admin"
ADMIN_PASS = "ludo2024"

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

@app.route("/admin", methods=["GET", "POST"])
def admin():
    if request.method == "POST":
        user = request.form.get("username")
        pwd = request.form.get("password")
        if user == ADMIN_USER and pwd == ADMIN_PASS:
            session["admin"] = True
            return redirect("/admin")
        else:
            return render_template("admin_login.html", error="Credenciais incorrectas")
    
    if not session.get("admin"):
        return render_template("admin_login.html", error=None)
    
    return render_template("admin.html", scenarios=SCENARIOS)

@app.route("/admin/logout")
def admin_logout():
    session.clear()
    return redirect("/admin")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
