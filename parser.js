
const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function fastParse(text) {
  const results = [];
  const lines = text.split("\n");
  for (let raw of lines) {
    let line = raw.trim();
    if (!line || line.length < 2) continue;
    if (/^(salam|ameen|jazakallah|mashallah)/i.test(line)) continue;
    let m1 = line.match(/^(.{2,40}?)[\s.:\-]+(\d{2,7})\s*$/);
    let m2 = line.match(/(\d{2,7})\s*(?:durood|darood|darood shareef|durood pak)/i);
    let m3 = line.match(/(.{2,30}?).*?(\d{2,7})\s*(?:durood|darood)/i);
    if (m1) {
      results.push({ name: m1[1].replace(/durood|pak|shareef|darood/gi,"").trim(), count: parseInt(m1[2]) });
    } else if (m3) {
      results.push({ name: m3[1].trim(), count: parseInt(m3[2]) });
    } else if (m2) {
      results.push({ name: "Unknown", count: parseInt(m2[1]) });
    }
  }
  return results.filter(r => r.count >= 10 && r.count <= 1000000);
}

async function aiParse(text) {
  try {
    const prompt = "You are Durood Pak counter parser. Extract name and count from WhatsApp message. Rules: Message can be English, Urdu, Sindhi like Dildar. 1000 or 32500. Return ONLY JSON: {results: [{name,count}]}. If only number, name=Unknown. Ignore salam, emoji. Text: " + text.slice(0,4000);
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1
    });
    const data = JSON.parse(res.choices[0].message.content);
    return data.results || data.data || [];
  } catch (e) {
    console.log("AI parse error", e.message);
    return [];
  }
}

async function parseDuroodMessage(text) {
  const fast = fastParse(text);
  if (fast.length > 0) return fast;
  if (/\d{2,}/.test(text)) {
    return await aiParse(text);
  }
  return [];
}

module.exports = { parseDuroodMessage, fastParse };
