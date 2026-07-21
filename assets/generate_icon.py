#!/usr/bin/env python3
"""Gera o icone do Dybass Estudioso (1024x1024 PNG) sem dependencias externas.

Desenha um livro vermelho escuro sobre fundo preto com a letra "D".
Usa apenas a biblioteca padrao (zlib + struct) para escrever o PNG. A arte e
desenhada numa grade base de 256 e ampliada por SCALE na escrita, gerando
1024x1024 — acima do minimo de 512x512 exigido pelo macOS (e valido tambem
para Windows e Linux).
"""
import struct
import zlib

SIZE = 256          # grade base de desenho
SCALE = 4           # fator de ampliacao -> saida 1024x1024
OUT = SIZE * SCALE
BG = (10, 10, 10)          # #0a0a0a fundo
DARK_RED = (139, 0, 0)     # #8b0000 capa do livro
RED = (192, 57, 43)        # #c0392b detalhe
WHITE = (240, 240, 240)    # letra

px = [[BG for _ in range(SIZE)] for _ in range(SIZE)]


def rounded_rect(x0, y0, x1, y1, r, color):
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            dx = min(x - x0, x1 - 1 - x)
            dy = min(y - y0, y1 - 1 - y)
            if dx < r and dy < r:
                if (r - dx) ** 2 + (r - dy) ** 2 > r * r:
                    continue
            if 0 <= x < SIZE and 0 <= y < SIZE:
                px[y][x] = color


def rect(x0, y0, x1, y1, color):
    for y in range(int(y0), int(y1)):
        for x in range(int(x0), int(x1)):
            if 0 <= x < SIZE and 0 <= y < SIZE:
                px[y][x] = color


# Livro: capa vermelho escuro arredondada
rounded_rect(48, 40, 208, 216, 22, DARK_RED)
# Lombada (faixa mais clara a esquerda)
rect(48, 40, 78, 216, RED)
rect(74, 40, 80, 216, (90, 0, 0))
# Paginas (faixa branca fina na direita)
rect(198, 52, 208, 204, (220, 220, 220))

# Letra "D" branca estilizada no centro da capa
rect(108, 80, 124, 176, WHITE)       # haste vertical
rect(124, 80, 160, 92, WHITE)        # topo
rect(124, 164, 160, 176, WHITE)      # base
rect(156, 88, 172, 168, WHITE)       # lado direito
rect(148, 84, 164, 96, WHITE)        # canto sup.
rect(148, 160, 164, 172, WHITE)      # canto inf.


def write_png(path):
    # Amplia a grade base por SCALE (nearest-neighbor) ao emitir os pixels.
    raw = bytearray()
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            row.extend(bytes(px[y][x]) * SCALE)  # repete o pixel na horizontal
        for _ in range(SCALE):                   # repete a linha na vertical
            raw.append(0)  # filtro None por linha
            raw.extend(row)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", OUT, OUT, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", compressed))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    write_png("icon.png")
    print(f"icon.png ({OUT}x{OUT}) gerado.")
