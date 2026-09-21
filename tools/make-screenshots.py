# -*- coding: utf-8 -*-
"""把验证截图处理成能公开的仓库配图：糊掉个人区（侧栏会话列表、右下角挂件/余额气泡）。

用法： python make-screenshots.py <输出目录>
"""
import os
import sys

from PIL import Image, ImageFilter

SRC = r"C:\Users\Lenovo\.dsh\playwright"

# (源文件, 输出名, 裁切区域或 None, 需要打码的矩形列表)
# 侧栏只糊「会话列表」那一段（新会话按钮、工作区标题保持可见）；
# 右下角只糊挂件/余额气泡占的那块，别盖住输入框卡片的右缘。
# 第二张裁成细节图：只留「运行中那行状态文案 + 输入框卡片」，避开对话正文与挂件。
SHOTS = [
    ("screenshot-2026-09-21T13-12-48-788Z.png", "01-overview.jpg", None, [
        (0, 150, 224, 720),
    ]),
    ("screenshot-2026-09-21T13-25-48-494Z.png", "02-turn-status.jpg", (232, 500, 1010, 706), []),
    ("screenshot-2026-09-21T13-13-56-198Z.png", "03-switch-off.jpg", None, [
        (0, 150, 224, 720),
        (1104, 566, 1280, 720),
    ]),
]


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)
    for name, out_name, crop, boxes in SHOTS:
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            print("跳过（找不到）:", name)
            continue
        im = Image.open(path).convert("RGB")
        if crop is not None:
            im = im.crop(crop)
        for box in boxes:
            box = (max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3]))
            if box[2] <= box[0] or box[3] <= box[1]:
                continue
            region = im.crop(box).filter(ImageFilter.GaussianBlur(18))
            im.paste(region, box)
        target = os.path.join(outdir, out_name)
        im.save(target, "JPEG", quality=88, optimize=True)
        print("%-22s %5d KB  %dx%d" % (out_name, os.path.getsize(target) // 1024, im.width, im.height))


if __name__ == "__main__":
    main()
