/** Compact prompt for Qwen chat UI (avoid multiline Enter-sends via LLMs2API typer). */
export const IELTS_PARSE_PROMPT_CHAT = `You are an IELTS paper structure expert. The user message includes exam page IMAGE(s). Read the image(s) and reply with ONE JSON object only (no markdown fences, no commentary).

Schema:
{"id":string,"module":"listening"|"reading"|"unknown","title":string?,"sections":[{"id":string,"heading":string,"questionRange":string?,"groups":[{"id":string,"heading":string?,"instructions":string[]?,"wordLimit":{"maxWords":number?,"allowNumber":boolean?,"raw":string?}?,"blocks":Block[]}]}],"sourceImages":string[]?}

Block "type" values and shapes:
- form|notes: {type,title?,rows:[{label?,isExample?,parts:TextPart[]}]}
- example: {type,label?,parts}
- sentences: {type,items:[{questionNumber,parts}]}
- table: {type,title?,headers?:string[],rows:[{cells:[{parts}]}]}
- map|plan|diagram: {type,title?,image?:{sourceIndex:number,crop?:{x,y,w,h}},labels:[{questionNumber,promptBefore?,promptAfter?,maxWords?}]}
- multipleChoice: {type,title?,questions:[{questionNumber,stem,options:[{letter,text}]}],decorativeImage?:{sourceIndex,crop?}}
- matchingFromBox: {type,boxTitle?,options:[{letter,text}],itemsTitle?,items:[{questionNumber,text}]}
- multiSelectLetters: {type,selectCount,prompt,options:[{letter,text}],questionNumbers:number[]}
- passage: {type,title?,guidance?,paragraphs:string[],figure?:{sourceIndex,crop?,caption?}}
- trueFalseNotGiven|yesNoNotGiven: {type,key:[{value,meaning}],statements:[{questionNumber,text}]}
- classify: {type,prompt?,categories:[{letter,text}],listTitle?,items:[{questionNumber,text}]}

TextPart: {"kind":"text","text":string} OR {"kind":"answer","questionNumber":number,"maxWords"?:number,"allowNumber"?:boolean,"width"?:"sm"|"md"|"lg"}

Rules: preserve headings/instructions/word limits; replace blanks with answer parts (never invent Q numbers); Example rows are not live answers; static filled lines stay text; for visuals set sourceIndex 0-based; matchingFromBox keeps options+items; Choose N letters => multiSelectLetters; tables keep inline answers; Reading uses passage + TFNG/classify/MCQ; unsure => needsReview:true; STRICT JSON only.`;

export const IELTS_PARSE_PROMPT = IELTS_PARSE_PROMPT_CHAT;
