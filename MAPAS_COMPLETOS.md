# Mapas do Jogo Flap Copa — Todos os 6 mapas

**Status: ✅ 6/6 mapas baixados**

---

## 1. 🇧🇷 Brasil
| Atributo | Valor |
|----------|-------|
| **ID** | `brasil` |
| **Pássaro** | `bird-brasil.png` ✅ (234 KB) |
| **GIF** | `brasil1.gif` ✅ (8.3 MB) |
| **Céu** | `#4ec0ca` → `#87ceeb` → `#ded895` |
| **Canos** | `#5cb85c` / `#7ed957` / `#4a9e4a` |
| **Borda cano** | `#2d6a2d` |
| **Tampa cano** | `#6fdc6f` |
| **Chão** | `#6abe30` |

## 2. 🇦🇷 Argentina
| Atributo | Valor |
|----------|-------|
| **ID** | `argentina` |
| **Pássaro** | `bird-argentina.png` ✅ (306 KB) |
| **GIF** | `argentina.gif` ✅ (16.9 MB) |
| **Céu** | `#6fb7e9` → `#a8d4f2` → `#e8f3e0` |
| **Canos** | `#5d9fd6` / `#8fc4ec` / `#4a86bd` |
| **Borda cano** | `#2f5e8f` |
| **Tampa cano** | `#f2f7fb` |
| **Chão** | `#7cc24e` |

## 3. 🇵🇹 Portugal
| Atributo | Valor |
|----------|-------|
| **ID** | `portugal` |
| **Pássaro** | `bird-portugal.png` ✅ (273 KB) |
| **GIF** | `portuga.gif` ✅ (14.8 MB) |
| **Céu** | `#f7b267` → `#f9d29d` → `#fdebd2` |
| **Canos** | `#c0392b` / `#e74c3c` / `#992d22` |
| **Borda cano** | `#6e1f17` |
| **Tampa cano** | `#1b6b39` |
| **Chão** | `#3f9e4d` |

## 4. 🇩🇪 Alemanha
| Atributo | Valor |
|----------|-------|
| **ID** | `alemanha` |
| **Pássaro** | `bird-alemanha.png` ✅ (287 KB) |
| **GIF** | `alemanha.gif` ✅ (14.7 MB) |
| **Céu** | `#8aa9c1` → `#b9cdde` → `#e9e4cf` |
| **Canos** | `#3a3a3a` / `#5a5a5a` / `#262626` |
| **Borda cano** | `#111111` |
| **Tampa cano** | `#f4c20d` (amarelo) |
| **Chão** | `#5fae3a` |

## 5. 🇫🇷 França
| Atributo | Valor |
|----------|-------|
| **ID** | `franca` |
| **Pássaro** | `bird-franca.png` ✅ (280 KB) |
| **GIF** | `franca.gif` ✅ (15.3 MB) |
| **Céu** | `#5b8ed6` → `#9dbdea` → `#e9eef8` |
| **Canos** | `#27408b` / `#4564b8` / `#1c2f66` |
| **Borda cano** | `#13204a` |
| **Tampa cano** | `#e8eef8` |
| **Chão** | `#6cb73f` |

## 6. 🇪🇸 Espanha
| Atributo | Valor |
|----------|-------|
| **ID** | `espanha` |
| **Pássaro** | `bird-espanha.png` ✅ (277 KB) |
| **GIF** | `expanha.gif` ✅ (14.5 MB) |
| **Céu** | `#f6a85c` → `#fbcf8b` → `#fdeec7` |
| **Canos** | `#c8341f` / `#e8533a` / `#9c2716` |
| **Borda cano** | `#6e1a0e` |
| **Tampa cano** | `#ffc107` |
| **Chão** | `#7ab648` |

---

## Assets compartilhados
- `background.png` ✅ (306 KB) — Fundo estático usado nas telas
- `bird.png` ✅ (234 KB) — Ícone/logo do game
- `hero.png` ✅ (2.3 MB) — Imagem principal do painel

## Total de assets de mapas: 18 arquivos
- **6** sprites de pássaro (PNG)
- **6** animações de fundo (GIF)
- **1** fundo estático (PNG)
- **2** imagens de UI (PNG)

## Detalhe técnico: cada mapa é definido no JS (`painel-page-e36975dd8a8338f9.js`)
```javascript
{ id, nome, bandeira, bird, skyTop, skyMid, skyBottom, cloud, hill,
  pipe[], pipeStroke, pipeCap, ground, groundTop, groundLine, bgGif }
```

Alemanha não aparece no carrossel do painel (apenas 5 visíveis), mas está no código como mapa jogável.
