#!/usr/bin/env python3
"""Pomodoro CLI — timer no terminal com barra animada e histórico."""

import time
import json
import os
import sys
import argparse
from datetime import datetime, date

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "history.json")

# Durations in seconds (overridable via args)
DEFAULT_WORK = 25 * 60
DEFAULT_SHORT_BREAK = 5 * 60
DEFAULT_LONG_BREAK = 15 * 60
POMODOROS_BEFORE_LONG = 4

COLORS = {
    "red":    "\033[91m",
    "green":  "\033[92m",
    "yellow": "\033[93m",
    "cyan":   "\033[96m",
    "bold":   "\033[1m",
    "reset":  "\033[0m",
}

def color(text, *keys):
    if not sys.stdout.isatty():
        return text
    prefix = "".join(COLORS[k] for k in keys)
    return f"{prefix}{text}{COLORS['reset']}"

def beep(times=1):
    if sys.stdout.isatty():
        for _ in range(times):
            print("\a", end="", flush=True)
            time.sleep(0.3)

def format_time(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"

def draw_bar(elapsed, total, width=40):
    filled = int(width * elapsed / total)
    bar = "█" * filled + "░" * (width - filled)
    pct = int(100 * elapsed / total)
    return f"[{bar}] {pct:3d}%"

def run_timer(label, duration, bar_color="cyan"):
    print()
    start = time.time()
    try:
        while True:
            elapsed = time.time() - start
            remaining = max(0, duration - elapsed)
            bar = draw_bar(elapsed, duration)
            line = (
                f"  {color(label, 'bold')}  "
                f"{color(format_time(remaining), bar_color, 'bold')}  "
                f"{color(bar, bar_color)}"
            )
            print(f"\r{line}  ", end="", flush=True)
            if elapsed >= duration:
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"\n\n  {color('Interrompido.', 'yellow')}")
        return False
    print(f"\n  {color('✓ Concluído!', 'green', 'bold')}")
    beep(2)
    return True

def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {"sessions": []}

def save_session(label, duration_min, completed):
    data = load_history()
    data["sessions"].append({
        "date": str(date.today()),
        "time": datetime.now().strftime("%H:%M"),
        "label": label,
        "minutes": duration_min,
        "completed": completed,
    })
    with open(HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def show_history():
    data = load_history()
    sessions = data["sessions"]
    if not sessions:
        print(color("  Nenhuma sessão registrada ainda.", "yellow"))
        return

    # Group by date
    by_date = {}
    for s in sessions:
        by_date.setdefault(s["date"], []).append(s)

    total_pomodoros = sum(1 for s in sessions if s["label"] == "Foco" and s["completed"])
    total_minutes = sum(s["minutes"] for s in sessions if s["label"] == "Foco" and s["completed"])

    print(color("\n  📊 Histórico de Sessões\n", "bold"))
    for d in sorted(by_date.keys(), reverse=True)[:7]:
        day_sessions = by_date[d]
        pomos = sum(1 for s in day_sessions if s["label"] == "Foco" and s["completed"])
        mins = sum(s["minutes"] for s in day_sessions if s["label"] == "Foco" and s["completed"])
        print(color(f"  {d}", "cyan", "bold") + f"  — {pomos} pomodoro(s), {mins} min de foco")
        for s in day_sessions:
            icon = "✓" if s["completed"] else "✗"
            c = "green" if s["completed"] else "red"
            print(f"    {color(icon, c)}  {s['time']}  {s['label']} ({s['minutes']} min)")
    print()
    print(f"  Total: {color(str(total_pomodoros), 'bold')} pomodoros concluídos, "
          f"{color(str(total_minutes), 'bold')} min de foco")
    print()

def ask(prompt):
    try:
        return input(prompt).strip().lower()
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Pomodoro CLI")
    parser.add_argument("--work", type=int, default=25, help="Minutos de foco (padrão: 25)")
    parser.add_argument("--short", type=int, default=5, help="Pausa curta em min (padrão: 5)")
    parser.add_argument("--long", type=int, default=15, help="Pausa longa em min (padrão: 15)")
    parser.add_argument("--history", action="store_true", help="Mostrar histórico e sair")
    args = parser.parse_args()

    if args.history:
        show_history()
        return

    work_sec = args.work * 60
    short_sec = args.short * 60
    long_sec = args.long * 60

    print(color("\n  🍅 Pomodoro CLI", "red", "bold"))
    print(color(f"  Foco: {args.work}min  |  Pausa curta: {args.short}min  |  Pausa longa: {args.long}min\n", "reset"))
    print("  Pressione " + color("Ctrl+C", "yellow") + " para interromper.\n")

    pomodoro_count = 0

    while True:
        pomodoro_count += 1
        label = f"🍅 Pomodoro #{pomodoro_count} — Foco"
        print(color(f"\n  ── Pomodoro #{pomodoro_count} ──", "red", "bold"))

        completed = run_timer(label, work_sec, bar_color="red")
        save_session("Foco", args.work, completed)
        if not completed:
            break

        if pomodoro_count % POMODOROS_BEFORE_LONG == 0:
            print(color(f"\n  🎉 {POMODOROS_BEFORE_LONG} pomodoros! Hora da pausa longa.", "green", "bold"))
            ans = ask(f"  Iniciar pausa longa de {args.long} min? [s/n] ")
            if ans != "n":
                ok = run_timer("☕ Pausa longa", long_sec, bar_color="green")
                save_session("Pausa longa", args.long, ok)
        else:
            ans = ask(f"  Iniciar pausa curta de {args.short} min? [s/n] ")
            if ans != "n":
                ok = run_timer("🌿 Pausa curta", short_sec, bar_color="green")
                save_session("Pausa curta", args.short, ok)

        ans = ask("  Continuar com o próximo pomodoro? [s/n] ")
        if ans == "n":
            break

    show_history()

if __name__ == "__main__":
    main()
