import sharp from "sharp";
for (const size of [192, 512]) await sharp("public/brand/igo-delivery.jpg").resize(size,size,{fit:"contain",background:"#ffea00"}).png().toFile(`public/brand/igo-icon-${size}.png`);
