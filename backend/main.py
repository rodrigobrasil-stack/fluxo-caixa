from __future__ import annotations

from typing import Literal
from datetime import datetime
import re
import unicodedata
import os
import json
import traceback

import requests
import gspread
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google.oauth2.service_account import Credentials

# =========================
# CONFIG
# =========================
SHEETS = {
    "Entradas": ["id", "data", "descricao", "categoria", "valor", "status"],
    "Saidas": ["id", "data", "descricao", "categoria", "forma_pagamento", "valor", "status"],
    "DespesasMes": ["id", "conta_mes", "descricao", "vencimento", "forma_pagamento", "valor", "status"],
}

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_ALLOWED_CHAT_ID = os.getenv("TELEGRAM_ALLOWED_CHAT_ID", "").strip()
TELEGRAM_WEBHOOK_URL = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()

TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""

SPREADSHEET_ID = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
GOOGLE_SHEETS_CREDENTIALS_JSON = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON", "").strip()

cors_origins_env = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://rodrigobrasil-stack.github.io"
).strip()

ALLOWED_ORIGINS = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]


# =========================
# MODELOS
# =========================
class EntradaIn(BaseModel):
    data: str
    descricao: str = Field(min_length=1)
    categoria: str = Field(min_length=1)
    valor: float = Field(ge=0)
    status: str = "Recebido"


class EntradaOut(EntradaIn):
    id: int


class SaidaIn(BaseModel):
    data: str
    descricao: str = Field(min_length=1)
    categoria: str = Field(min_length=1)
    forma_pagamento: str = Field(min_length=1)
    valor: float = Field(ge=0)
    status: str = "Pago"


class SaidaOut(SaidaIn):
    id: int


class DespesaIn(BaseModel):
    conta_mes: str = Field(min_length=1)
    descricao: str = Field(min_length=1)
    vencimento: str
    forma_pagamento: str = Field(min_length=1)
    valor: float = Field(ge=0)
    status: Literal["Pendente", "Pago", "Vencido"] = "Pendente"


class DespesaOut(DespesaIn):
    id: int


# =========================
# APP
# =========================
app = FastAPI(title="Fluxo de Caixa API", version="2.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS else ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# GOOGLE SHEETS
# =========================
def validate_required_settings() -> None:
    missing = []

    if not GOOGLE_SHEETS_CREDENTIALS_JSON:
        missing.append("GOOGLE_SHEETS_CREDENTIALS_JSON")

    if not SPREADSHEET_ID:
        missing.append("GOOGLE_SHEETS_SPREADSHEET_ID")

    if missing:
        raise RuntimeError("Variáveis obrigatórias não configuradas: " + ", ".join(missing))


def normalize_service_account_info(info: dict) -> dict:
    private_key = info.get("private_key", "")

    if not private_key:
        raise RuntimeError("Campo 'private_key' ausente ou vazio no JSON da service account.")

    private_key = private_key.strip()

    # Caso tenha sido colado com \n escapado no Render
    if "\\n" in private_key:
        private_key = private_key.replace("\\n", "\n")

    info["private_key"] = private_key
    return info


def get_gspread_client():
    validate_required_settings()

    try:
        info = json.loads(GOOGLE_SHEETS_CREDENTIALS_JSON)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GOOGLE_SHEETS_CREDENTIALS_JSON inválido: {exc}") from exc

    required_keys = ["type", "project_id", "private_key", "client_email", "token_uri"]
    missing_keys = [key for key in required_keys if key not in info or not info.get(key)]
    if missing_keys:
        raise RuntimeError(
            "JSON da service account incompleto. Campos ausentes: " + ", ".join(missing_keys)
        )

    info = normalize_service_account_info(info)

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    try:
        credentials = Credentials.from_service_account_info(info, scopes=scopes)
        return gspread.authorize(credentials)
    except Exception as exc:
        raise RuntimeError(f"Erro ao autenticar service account no Google: {exc}") from exc


def get_spreadsheet():
    client = get_gspread_client()

    try:
        return client.open_by_key(SPREADSHEET_ID)
    except Exception as exc:
        raise RuntimeError(
            "Erro ao abrir a planilha no Google Sheets. "
            "Verifique se o GOOGLE_SHEETS_SPREADSHEET_ID está correto "
            "e se a planilha foi compartilhada com o client_email da service account. "
            f"Detalhe: {exc}"
        ) from exc


def init_spreadsheet() -> None:
    sh = get_spreadsheet()
    existing = {ws.title for ws in sh.worksheets()}

    for sheet_name, headers in SHEETS.items():
        if sheet_name not in existing:
            ws = sh.add_worksheet(title=sheet_name, rows=1000, cols=len(headers))
            ws.append_row(headers)
        else:
            ws = sh.worksheet(sheet_name)
            values = ws.get_all_values()
            if not values:
                ws.append_row(headers)


def worksheet_rows_as_dicts(sheet_name: str) -> list[dict]:
    sh = get_spreadsheet()
    ws = sh.worksheet(sheet_name)
    rows = ws.get_all_records()

    data: list[dict] = []
    for row in rows:
        item = dict(row)
        if item.get("id") not in [None, ""]:
            item["id"] = int(item["id"])
        if item.get("valor") not in [None, ""]:
            item["valor"] = float(item["valor"])
        data.append(item)
    return data


def next_id(sheet_name: str) -> int:
    items = worksheet_rows_as_dicts(sheet_name)
    if not items:
        return 1
    return max(int(item["id"]) for item in items) + 1


def append_row(sheet_name: str, row: dict) -> dict:
    sh = get_spreadsheet()
    ws = sh.worksheet(sheet_name)
    headers = SHEETS[sheet_name]
    row_id = next_id(sheet_name)
    payload = {"id": row_id, **row}
    ws.append_row([payload.get(col) for col in headers], value_input_option="USER_ENTERED")
    return payload


def update_row(sheet_name: str, item_id: int, row: dict) -> dict:
    sh = get_spreadsheet()
    ws = sh.worksheet(sheet_name)
    headers = SHEETS[sheet_name]
    values = ws.get_all_values()

    end_col = chr(64 + len(headers))

    for idx, line in enumerate(values[1:], start=2):
        current_id = line[0]
        if str(current_id) == str(item_id):
            payload = {"id": item_id, **row}
            ws.update(f"A{idx}:{end_col}{idx}", [[payload.get(h) for h in headers]])
            return payload

    raise HTTPException(status_code=404, detail=f"Item {item_id} não encontrado em {sheet_name}.")


def delete_row(sheet_name: str, item_id: int) -> dict:
    sh = get_spreadsheet()
    ws = sh.worksheet(sheet_name)
    values = ws.get_all_values()

    for idx, line in enumerate(values[1:], start=2):
        current_id = line[0]
        if str(current_id) == str(item_id):
            ws.delete_rows(idx)
            return {"success": True, "id": item_id}

    raise HTTPException(status_code=404, detail=f"Item {item_id} não encontrado em {sheet_name}.")


# =========================
# HELPERS
# =========================
def format_currency(value: float) -> str:
    inteiro, decimal = f"{value:.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro},{decimal}"


def parse_valor(texto: str) -> float:
    texto = texto.strip().replace("R$", "").replace(" ", "")
    texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return 0.0


def hoje_br() -> str:
    return datetime.now().strftime("%d/%m/%Y")


def normalize_text(texto: str) -> str:
    texto = (texto or "").strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def calcular_resumo() -> dict:
    entradas = worksheet_rows_as_dicts("Entradas")
    saidas = worksheet_rows_as_dicts("Saidas")
    despesas = worksheet_rows_as_dicts("DespesasMes")

    total_entradas = sum(float(item.get("valor", 0) or 0) for item in entradas)

    total_saidas_base = sum(
        float(item.get("valor", 0) or 0)
        for item in saidas
        if str(item.get("forma_pagamento", "")).strip().lower() not in ["cartão de crédito", "cartao de credito"]
    )

    total_despesas_pagas = sum(
        float(item.get("valor", 0) or 0)
        for item in despesas
        if str(item.get("status", "")).strip() == "Pago"
        and str(item.get("forma_pagamento", "")).strip().lower() not in ["cartão de crédito", "cartao de credito"]
    )

    total_cartao = sum(
        float(item.get("valor", 0) or 0)
        for item in saidas
        if str(item.get("forma_pagamento", "")).strip().lower() in ["cartão de crédito", "cartao de credito"]
    )

    saldo_atual = total_entradas - (total_saidas_base + total_despesas_pagas)

    return {
        "saldo_atual": saldo_atual,
        "total_entradas": total_entradas,
        "total_saidas": total_saidas_base + total_despesas_pagas,
        "total_cartao_credito": total_cartao,
    }


# =========================
# TELEGRAM
# =========================
def telegram_send_message(chat_id: str, text: str) -> None:
    if not TELEGRAM_API_URL:
        return

    try:
        response = requests.post(
            f"{TELEGRAM_API_URL}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=20,
        )
        print(f"[Telegram] sendMessage => {response.status_code} | {response.text}")
    except Exception as exc:
        print(f"[Telegram] Erro ao enviar mensagem: {exc}")


def telegram_get_me():
    if not TELEGRAM_API_URL:
        return

    try:
        r = requests.get(f"{TELEGRAM_API_URL}/getMe", timeout=20)
        print(f"[Telegram] getMe => {r.status_code} | {r.text}")
    except Exception as exc:
        print(f"[Telegram] Erro no getMe: {exc}")


def telegram_set_webhook():
    if not TELEGRAM_API_URL or not TELEGRAM_WEBHOOK_URL:
        print("[Telegram] Webhook não configurado.")
        return

    payload = {
        "url": TELEGRAM_WEBHOOK_URL,
        "drop_pending_updates": False,
    }

    if TELEGRAM_WEBHOOK_SECRET:
        payload["secret_token"] = TELEGRAM_WEBHOOK_SECRET

    try:
        response = requests.post(
            f"{TELEGRAM_API_URL}/setWebhook",
            json=payload,
            timeout=20,
        )
        print(f"[Telegram] setWebhook => {response.status_code} | {response.text}")
    except Exception as exc:
        print(f"[Telegram] Erro ao configurar webhook: {exc}")


def interpretar_mensagem(texto: str) -> dict:
    texto_original = (texto or "").strip()

    if not texto_original:
        return {"tipo": "ajuda"}

    texto = normalize_text(texto_original)

    if texto in ["/start", "start", "/help", "help", "ajuda"]:
        return {"tipo": "ajuda"}

    if texto in ["/saldo", "saldo"]:
        return {"tipo": "saldo"}

    if texto in ["/resumo", "resumo"]:
        return {"tipo": "resumo"}

    m = re.match(r"^entrada\s+([0-9\.,]+)\s+(.+)$", texto, flags=re.IGNORECASE)
    if m:
        valor = parse_valor(m.group(1))
        resto = m.group(2).strip()
        partes = resto.split(" ", 1)
        categoria = partes[0].title()
        descricao = partes[1].strip() if len(partes) > 1 else categoria

        return {
            "tipo": "entrada",
            "payload": {
                "data": hoje_br(),
                "descricao": descricao,
                "categoria": categoria,
                "valor": valor,
                "status": "Recebido",
            },
        }

    m = re.match(r"^saida\s+([0-9\.,]+)\s+(.+)$", texto, flags=re.IGNORECASE)
    if m:
        valor = parse_valor(m.group(1))
        resto = m.group(2).strip()

        formas = [
            ("cartao de credito", "Cartão de Crédito"),
            ("cartao de debito", "Cartão de Débito"),
            ("transferencia", "Transferência"),
            ("boleto", "Boleto"),
            ("pix", "PIX"),
            ("dinheiro", "Dinheiro"),
        ]

        forma_pagamento = "PIX"
        descricao = resto

        for chave, valor_forma in formas:
            if resto.startswith(chave):
                forma_pagamento = valor_forma
                descricao = resto[len(chave):].strip()
                break

        descricao = descricao or "Lançamento via Telegram"
        categoria = descricao.split(" ")[0].title() if descricao else "Outros"

        return {
            "tipo": "saida",
            "payload": {
                "data": hoje_br(),
                "descricao": descricao,
                "categoria": categoria,
                "forma_pagamento": forma_pagamento,
                "valor": valor,
                "status": "Pago",
            },
        }

    m = re.match(r"^despesas?\s+([0-9\.,]+)\s+(.+)$", texto, flags=re.IGNORECASE)
    if m:
        valor = parse_valor(m.group(1))
        resto = m.group(2).strip()

        formas = [
            ("transferencia", "Transferência"),
            ("boleto", "Boleto"),
            ("pix", "PIX"),
            ("dinheiro", "Dinheiro"),
        ]

        forma_pagamento = "PIX"
        descricao = resto

        for chave, valor_forma in formas:
            if resto.startswith(chave):
                forma_pagamento = valor_forma
                descricao = resto[len(chave):].strip()
                break

        status = "Pendente"
        vencimento = hoje_br()

        status_match = re.search(r"\b(pago|pendente|vencido)$", descricao)
        if status_match:
            status_txt = status_match.group(1)
            descricao = descricao[:status_match.start()].strip()
            if status_txt == "pago":
                status = "Pago"
            elif status_txt == "vencido":
                status = "Vencido"
            else:
                status = "Pendente"

        data_match = re.search(r"(\d{2}/\d{2}/\d{4})$", descricao)
        if data_match:
            vencimento = data_match.group(1)
            descricao = descricao[:data_match.start()].strip()

        descricao = descricao or "Despesa via Telegram"
        conta_mes = descricao.split(" ")[0].title() if descricao else "Outros"

        return {
            "tipo": "despesa",
            "payload": {
                "conta_mes": conta_mes,
                "descricao": descricao,
                "vencimento": vencimento,
                "forma_pagamento": forma_pagamento,
                "valor": valor,
                "status": status,
            },
        }

    return {"tipo": "ajuda"}


def processar_update(update: dict) -> None:
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id", "")).strip()
    texto = message.get("text", "")

    if not chat_id:
        print("[Telegram] Update sem chat_id, ignorado.")
        return

    if TELEGRAM_ALLOWED_CHAT_ID and chat_id != TELEGRAM_ALLOWED_CHAT_ID:
        telegram_send_message(chat_id, "Este chat não está autorizado para lançar dados.")
        return

    acao = interpretar_mensagem(texto)

    try:
        if acao["tipo"] == "entrada":
            item = append_row("Entradas", acao["payload"])
            telegram_send_message(
                chat_id,
                "✅ Entrada registrada com sucesso\n\n"
                f"ID: {item['id']}\n"
                f"Categoria: {item['categoria']}\n"
                f"Descrição: {item['descricao']}\n"
                f"Valor: {format_currency(float(item['valor']))}"
            )
            return

        if acao["tipo"] == "saida":
            item = append_row("Saidas", acao["payload"])
            aviso = ""
            if str(item["forma_pagamento"]).strip().lower() in ["cartão de crédito", "cartao de credito"]:
                aviso = "\n\nℹ️ Registrado apenas como cartão de crédito. Não debita do saldo atual."

            telegram_send_message(
                chat_id,
                "✅ Saída registrada com sucesso\n\n"
                f"ID: {item['id']}\n"
                f"Forma: {item['forma_pagamento']}\n"
                f"Descrição: {item['descricao']}\n"
                f"Valor: {format_currency(float(item['valor']))}"
                f"{aviso}"
            )
            return

        if acao["tipo"] == "despesa":
            item = append_row("DespesasMes", acao["payload"])
            telegram_send_message(
                chat_id,
                "✅ Despesa registrada com sucesso\n\n"
                f"ID: {item['id']}\n"
                f"Vencimento: {item['vencimento']}\n"
                f"Forma: {item['forma_pagamento']}\n"
                f"Status: {item['status']}\n"
                f"Descrição: {item['descricao']}\n"
                f"Valor: {format_currency(float(item['valor']))}"
            )
            return

        if acao["tipo"] == "saldo":
            resumo = calcular_resumo()
            telegram_send_message(
                chat_id,
                "💰 Saldo atual\n\n"
                f"Entradas: {format_currency(resumo['total_entradas'])}\n"
                f"Saídas: {format_currency(resumo['total_saidas'])}\n"
                f"Cartão de Crédito: {format_currency(resumo['total_cartao_credito'])}\n"
                f"Saldo Atual: {format_currency(resumo['saldo_atual'])}"
            )
            return

        if acao["tipo"] == "resumo":
            resumo = calcular_resumo()
            telegram_send_message(
                chat_id,
                "📊 Resumo financeiro\n\n"
                f"Entradas: {format_currency(resumo['total_entradas'])}\n"
                f"Saídas: {format_currency(resumo['total_saidas'])}\n"
                f"Cartão de Crédito: {format_currency(resumo['total_cartao_credito'])}\n"
                f"Saldo Atual: {format_currency(resumo['saldo_atual'])}"
            )
            return

        telegram_send_message(
            chat_id,
            "Comandos disponíveis:\n\n"
            "1) entrada 2500 salario Recebimento cliente\n"
            "2) saida 89,90 pix internet\n"
            "3) despesa 1200 boleto aluguel 20/04/2026\n"
            "4) despesa 3000 pix cartao nubank camila pago\n"
            "5) saldo\n"
            "6) resumo"
        )

    except Exception as exc:
        print(f"[Telegram] Erro no processamento: {exc}")
        print(traceback.format_exc())
        telegram_send_message(chat_id, f"❌ Erro ao processar mensagem: {exc}")


# =========================
# STARTUP
# =========================
@app.on_event("startup")
def startup_event():
    try:
        validate_required_settings()
        init_spreadsheet()
        print(f"[API] Google Sheets conectado. Spreadsheet ID = {SPREADSHEET_ID}")
    except Exception as exc:
        print(f"[API] Erro ao conectar no Google Sheets: {exc}")
        print(traceback.format_exc())
        raise

    print(f"[API] ALLOWED_ORIGINS = {ALLOWED_ORIGINS}")

    if TELEGRAM_BOT_TOKEN:
        telegram_get_me()
        telegram_set_webhook()
    else:
        print("[Telegram] Token não configurado.")


# =========================
# ROTAS
# =========================
@app.get("/")
def root():
    return {
        "message": "Fluxo de Caixa API online",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "storage": "google_sheets",
        "spreadsheet_id": SPREADSHEET_ID or "não definido",
        "telegram": "ativo" if TELEGRAM_BOT_TOKEN else "desativado",
        "allowed_chat_id": TELEGRAM_ALLOWED_CHAT_ID or "não definido",
        "allowed_origins": ALLOWED_ORIGINS,
        "webhook_url": TELEGRAM_WEBHOOK_URL or "não definido",
        "google_credentials_configured": bool(GOOGLE_SHEETS_CREDENTIALS_JSON),
    }


@app.get("/api/debug/google-sheets")
def debug_google_sheets():
    try:
        sh = get_spreadsheet()
        worksheets = [ws.title for ws in sh.worksheets()]
        return {
            "ok": True,
            "spreadsheet_id": SPREADSHEET_ID,
            "worksheets": worksheets,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    if TELEGRAM_WEBHOOK_SECRET:
        header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if header_secret != TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=403, detail="Webhook do Telegram não autorizado.")

    update = await request.json()
    processar_update(update)
    return {"ok": True}


@app.get("/api/entradas", response_model=list[EntradaOut])
def list_entradas():
    return worksheet_rows_as_dicts("Entradas")


@app.post("/api/entradas", response_model=EntradaOut)
def create_entrada(payload: EntradaIn):
    return append_row("Entradas", payload.model_dump())


@app.put("/api/entradas/{item_id}", response_model=EntradaOut)
def put_entrada(item_id: int, payload: EntradaIn):
    return update_row("Entradas", item_id, payload.model_dump())


@app.delete("/api/entradas/{item_id}")
def remove_entrada(item_id: int):
    return delete_row("Entradas", item_id)


@app.get("/api/saidas", response_model=list[SaidaOut])
def list_saidas():
    return worksheet_rows_as_dicts("Saidas")


@app.post("/api/saidas", response_model=SaidaOut)
def create_saida(payload: SaidaIn):
    return append_row("Saidas", payload.model_dump())


@app.put("/api/saidas/{item_id}", response_model=SaidaOut)
def put_saida(item_id: int, payload: SaidaIn):
    return update_row("Saidas", item_id, payload.model_dump())


@app.delete("/api/saidas/{item_id}")
def remove_saida(item_id: int):
    return delete_row("Saidas", item_id)


@app.get("/api/despesas", response_model=list[DespesaOut])
def list_despesas():
    return worksheet_rows_as_dicts("DespesasMes")


@app.post("/api/despesas", response_model=DespesaOut)
def create_despesa(payload: DespesaIn):
    return append_row("DespesasMes", payload.model_dump())


@app.put("/api/despesas/{item_id}", response_model=DespesaOut)
def put_despesa(item_id: int, payload: DespesaIn):
    return update_row("DespesasMes", item_id, payload.model_dump())


@app.delete("/api/despesas/{item_id}")
def remove_despesa(item_id: int):
    return delete_row("DespesasMes", item_id)