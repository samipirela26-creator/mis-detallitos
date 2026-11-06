# Afiche de estados (1080x1920) con los servicios que más se venden y sus precios.
from PIL import Image, ImageDraw, ImageFont
F = "/home/sanuel/.config/Claude/local-agent-mode-sessions/skills-plugin/be104618-8c6c-4605-8780-509be2d79890/d766388d-b0a3-4917-8cc8-803caf574843/skills/canvas-design/canvas-fonts"
W, H = 1080, 1920
TINTA, MARCA, AMARILLO, CREMA = (12, 30, 36), (11, 106, 130), (255, 196, 0), (247, 244, 235)
img = Image.new("RGB", (W, H), TINTA)
d = ImageDraw.Draw(img)
f = lambda n, s: ImageFont.truetype(f"{F}/{n}", s)

def centrado(y, txt, fuente, color, x0=0, x1=W):
    w = d.textlength(txt, font=fuente)
    d.text(((x0 + x1 - w) / 2, y), txt, font=fuente, fill=color)

# Franja de color superior
d.rectangle([0, 0, W, 14], fill=AMARILLO)
# Logo
logo = Image.open("public/icons/logo.webp").convert("RGBA")
logo.thumbnail((150, 150))
img.paste(logo, (70, 80), logo)
d.text((250, 110), "MIS DETALLITOS", font=f("BigShoulders-Bold.ttf", 54), fill=CREMA)
d.text((252, 168), "PAPELERÍA  ·  IMPRESIÓN  ·  DISEÑO", font=f("InstrumentSans-Regular.ttf", 24), fill=(150, 185, 195))

# Titular
centrado(270, "LO QUE MÁS", f("BigShoulders-Bold.ttf", 130), CREMA)
centrado(380, "PIDEN", f("BigShoulders-Bold.ttf", 200), AMARILLO)
centrado(610, "Precios claros, listo en el momento.", f("InstrumentSans-Italic.ttf", 36), (150, 185, 195))

items = [
    ("Impresión B/N", "tamaño carta", "1.000"),
    ("Impresión a color", "tamaño carta", "1.500"),
    ("Papel fotográfico", "impresión de foto", "10.000"),
    ("Stickers", "impresos y listos", "10.000"),
    ("Plastificado", "tamaño carta", "6.000"),
    ("Plastificado carnet", "para tu cédula o carné", "4.000"),
]
y = 700
alto = 150
for i, (t, s, p) in enumerate(items):
    d.rounded_rectangle([60, y, W - 60, y + alto - 18], radius=26, fill=CREMA if i % 2 == 0 else (230, 238, 238))
    d.rectangle([60, y + 22, 72, y + alto - 40], fill=MARCA)
    d.text((110, y + 14), t, font=f("BigShoulders-Bold.ttf", 60), fill=TINTA)
    d.text((112, y + 82), s, font=f("InstrumentSans-Regular.ttf", 28), fill=(70, 90, 96))
    precio = "$" + p
    pf = f("BigShoulders-Bold.ttf", 84)
    w = d.textlength(precio, font=pf)
    d.text((W - 110 - w, y + 8), precio, font=pf, fill=MARCA)
    wp = d.textlength("pesos", font=f("InstrumentSans-Regular.ttf", 24))
    d.text((W - 110 - wp, y + 98), "pesos", font=f("InstrumentSans-Regular.ttf", 24), fill=(70, 90, 96))
    y += alto

# Diseño
d.rounded_rectangle([60, y + 4, W - 60, y + 130], radius=26, fill=AMARILLO)
centrado(y + 14, "DISEÑO DE LOGOS Y MÁS", f("BigShoulders-Bold.ttf", 70), TINTA)
centrado(y + 84, "Pregunta por tu diseño personalizado", f("InstrumentSans-Bold.ttf", 32), TINTA)

# Pie
d.text((70, H - 120), "Escríbenos y haz tu pedido", font=f("InstrumentSans-Bold.ttf", 36), fill=CREMA)
d.text((70, H - 70), "Mis Detallitos G&M C.A", font=f("InstrumentSans-Regular.ttf", 28), fill=(150, 185, 195))
d.rectangle([0, H - 14, W, H], fill=AMARILLO)
img.save("publicidad/afiche-servicios.png")
print("ok", y)
