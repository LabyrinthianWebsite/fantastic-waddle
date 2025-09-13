const colorNames = [
  // Basic colors
  { name: "Red", r: 255, g: 0, b: 0 },
  { name: "Green", r: 0, g: 255, b: 0 },
  { name: "Blue", r: 0, g: 0, b: 255 },
  { name: "Yellow", r: 255, g: 255, b: 0 },
  { name: "Orange", r: 255, g: 165, b: 0 },
  { name: "Purple", r: 128, g: 0, b: 128 },
  { name: "Pink", r: 255, g: 192, b: 203 },
  { name: "Brown", r: 165, g: 42, b: 42 },
  { name: "Black", r: 0, g: 0, b: 0 },
  { name: "White", r: 255, g: 255, b: 255 },
  { name: "Gray", r: 128, g: 128, b: 128 },

  // Extended colors
  { name: "Crimson", r: 220, g: 20, b: 60 },
  { name: "Dark Red", r: 139, g: 0, b: 0 },
  { name: "Light Red", r: 255, g: 160, b: 122 },
  { name: "Forest Green", r: 34, g: 139, b: 34 },
  { name: "Light Green", r: 144, g: 238, b: 144 },
  { name: "Dark Green", r: 0, g: 100, b: 0 },
  { name: "Lime", r: 50, g: 205, b: 50 },
  { name: "Navy", r: 0, g: 0, b: 128 },
  { name: "Light Blue", r: 173, g: 216, b: 230 },
  { name: "Dark Blue", r: 0, g: 0, b: 139 },
  { name: "Sky Blue", r: 135, g: 206, b: 235 },
  { name: "Teal", r: 0, g: 128, b: 128 },
  { name: "Cyan", r: 0, g: 255, b: 255 },
  { name: "Gold", r: 255, g: 215, b: 0 },
  { name: "Light Yellow", r: 255, g: 255, b: 224 },
  { name: "Dark Orange", r: 255, g: 140, b: 0 },
  { name: "Light Orange", r: 255, g: 218, b: 185 },
  { name: "Violet", r: 238, g: 130, b: 238 },
  { name: "Magenta", r: 255, g: 0, b: 255 },
  { name: "Light Purple", r: 221, g: 160, b: 221 },
  { name: "Dark Purple", r: 148, g: 0, b: 211 },
  { name: "Hot Pink", r: 255, g: 105, b: 180 },
  { name: "Light Pink", r: 255, g: 182, b: 193 },
  { name: "Deep Pink", r: 255, g: 20, b: 147 },
  { name: "Tan", r: 210, g: 180, b: 140 },
  { name: "Beige", r: 245, g: 245, b: 220 },
  { name: "Dark Brown", r: 101, g: 67, b: 33 },
  { name: "Light Brown", r: 205, g: 133, b: 63 },
  { name: "Maroon", r: 128, g: 0, b: 0 },
  { name: "Light Gray", r: 211, g: 211, b: 211 },
  { name: "Dark Gray", r: 169, g: 169, b: 169 },
  { name: "Silver", r: 192, g: 192, b: 192 },

  // More specific colors
  { name: "Turquoise", r: 64, g: 224, b: 208 },
  { name: "Coral", r: 255, g: 127, b: 80 },
  { name: "Salmon", r: 250, g: 128, b: 114 },
  { name: "Peach", r: 255, g: 218, b: 185 },
  { name: "Mint", r: 152, g: 251, b: 152 },
  { name: "Lavender", r: 230, g: 230, b: 250 },
  { name: "Indigo", r: 75, g: 0, b: 130 },
  { name: "Olive", r: 128, g: 128, b: 0 },
  { name: "Khaki", r: 240, g: 230, b: 140 },
  { name: "Ivory", r: 255, g: 255, b: 240 },
  { name: "Cream", r: 255, g: 253, b: 208 }
];

class ColorNamer {
  constructor() {
    this.colorNames = colorNames;
  }

  // Calculate color distance using Euclidean distance in RGB space
  colorDistance(color1, color2) {
    return Math.sqrt(
      Math.pow(color1.r - color2.r, 2) +
      Math.pow(color1.g - color2.g, 2) +
      Math.pow(color1.b - color2.b, 2)
    );
  }

  // Get the name of the closest matching color
  getColorName(r, g, b) {
    const inputColor = { r, g, b };
    
    let closestColor = this.colorNames[0];
    let minDistance = this.colorDistance(inputColor, closestColor);

    this.colorNames.forEach(namedColor => {
      const distance = this.colorDistance(inputColor, namedColor);
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = namedColor;
      }
    });

    return closestColor.name;
  }

  // Get the three most dominant named colors from a color palette
  getThreeKeyColors(colorPalette) {
    if (!colorPalette || colorPalette.length === 0) {
      return [];
    }

    // Sort by dominance (assuming the palette is already sorted by dominance)
    // Take up to 3 colors and convert to named colors
    const keyColors = colorPalette.slice(0, 3).map(color => ({
      name: this.getColorName(color.r, color.g, color.b),
      hex: color.hex || this.rgbToHex(color.r, color.g, color.b),
      r: color.r,
      g: color.g,
      b: color.b
    }));

    // Remove duplicates by name (keep the first occurrence which is most dominant)
    const uniqueColors = [];
    const seenNames = new Set();
    
    keyColors.forEach(color => {
      if (!seenNames.has(color.name)) {
        uniqueColors.push(color);
        seenNames.add(color.name);
      }
    });

    return uniqueColors;
  }

  // Convert RGB to hex
  rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Get all available color names for filtering
  getAllColorNames() {
    return [...new Set(this.colorNames.map(c => c.name))].sort();
  }

  // Check if a color palette contains a specific named color (with tolerance)
  hasColor(colorPalette, colorName, tolerance = 50) {
    if (!colorPalette || colorPalette.length === 0) return false;

    const targetColor = this.colorNames.find(c => c.name.toLowerCase() === colorName.toLowerCase());
    if (!targetColor) return false;

    return colorPalette.some(color => {
      const distance = this.colorDistance(color, targetColor);
      return distance <= tolerance;
    });
  }
}

module.exports = ColorNamer;