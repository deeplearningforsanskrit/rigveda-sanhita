import json
import re
from pathlib import Path

INPUT_FILE = Path("rigveda.json")
OUTPUT_FILE = Path("rigveda_joined.json")

# Vedic accent / combining marks that may appear after the base vowel.
# We ignore them when checking final visible vowel shape.
COMBINING_MARKS = re.compile(r"[\u0951\u0952\u1CD0-\u1CFA\uA8E0-\uA8F1]+")

SWARS = """अ
आ
इ
ई
उ
ऊ
ऋ
ए
ऐ
ऑ
ओ
औ
अं
अः""".split()

# punctuation we want to preserve as separators instead of joining across them
HARD_SEPARATORS = {"।", "॥", ".", ",", ";", ":", "?", "!"}



def main():
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)

    out = {}



    for ref, value in data.items():
        text = value['text'].split(" ")

        
        new_text = text[0]

        for nxt in text[1:]:
            if nxt in ['।','॥'] :
                new_text += " " + nxt + " "
            elif nxt[0] in SWARS:
                new_text += "ऽ"+nxt
            else:
                new_text += nxt 
        out[ref] = value
        out[ref]['text'] = new_text



    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))




    #     original = convert_value_to_text(value)
    #     joined = join_words_with_limited_avagraha(original)

    #     out[ref] = {
    #         "text_original": original,
    #         "text_joined": joined,
    #     }

    # with OUTPUT_FILE.open("w", encoding="utf-8") as f:
    #     json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # print(f"Saved {len(out)} entries to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()