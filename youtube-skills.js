/* YouTube Agent Skills — additive module for AI Content Factory */
(function(){
  const skills=[
    ["script","🎯 Script + Hooks","Generate and score 5 opening hooks, then build a strong YouTube script.","Topic, audience, key points and desired length."],
    ["package","🖼️ Title + Thumbnail Package","Create title options and a matching thumbnail concept/prompt as one package.","Topic, promise, audience and visual idea."],
    ["edit","✂️ Edit Decision List","Turn a transcript into an editing plan: dead air, fillers, repeats, weak sections and B-roll opportunities.","Paste transcript or rough edit notes."],
    ["comments","💬 Comment Replies","Classify comments and draft helpful, natural replies without sounding spammy.","Paste YouTube comments, one per line."],
    ["plan","📅 Weekly Content Plan","Build a realistic weekly plan mixing long videos and Shorts around one topic/niche.","Niche, available days, audience and goals."],
    ["research","🔎 Niche / Viral Research","Find content opportunities, angles and competitor-style gaps. For current topics the backend can use web research.","Niche, audience and topic/competitors."],
    ["retention","📈 Retention Analysis","Analyze retention data and identify the biggest drop, likely reason and concrete fix.","Paste retention CSV/table or timestamp + percentage data."],
    ["shorts","📱 Shorts Finder","Find the strongest Shorts-worthy moments from a long-video transcript.","Paste long-video transcript."],
    ["seo","🔍 YouTube SEO","Generate search intent, description structure, keywords, tags and metadata ideas.","Topic, target query and audience."],
    ["chapters","⏱️ Chapters","Create clean YouTube chapter timestamps from a transcript with timestamps.","Paste timestamped transcript."],
    ["audit","🧪 Channel Audit","Audit titles, thumbnails, hooks, consistency, retention signals and next actions.","Paste channel/video stats or notes."]
  ];
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  let selected="script";
  function skillById(id){return skills.find(x=>x[0]===id)||skills[0];}
  function render(){
    const view=document.getElementById("view"), title=document.getElementById("page-title");
    if(!view)return;
    if(title)title.textContent="YouTube Agent Skills";
    view.innerHTML=`
      <style>
        .ytlab{padding:4px 0 30px}.yt-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}
        .yt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
        .yt-skill{border:1px solid rgba(120,150,190,.2);background:rgba(9,18,32,.72);color:inherit;border-radius:14px;padding:13px;text-align:left;cursor:pointer;min-height:100px}
        .yt-skill:hover,.yt-skill.selected{border-color:rgba(125,150,255,.75);transform:translateY(-1px)}
        .yt-skill b{display:block;font-size:14px;margin-bottom:6px}.yt-skill small{display:block;color:#9eabc1;line-height:1.4}
        .yt-work{margin-top:16px;padding:18px;border:1px solid rgba(120,150,190,.2);border-radius:16px;background:rgba(7,15,28,.82)}
        .yt-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.yt-form label{font-size:12px;color:#a9b5c9}.yt-form input,.yt-form select,.yt-form textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border-radius:10px;border:1px solid #34415e;background:#07111f;color:#fff}
        .yt-form textarea{min-height:180px;resize:vertical}.yt-wide{grid-column:1/-1}.yt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.yt-result{white-space:pre-wrap;line-height:1.55;margin-top:14px;padding:14px;border-radius:12px;background:#050b14;border:1px solid rgba(120,150,190,.15);max-height:560px;overflow:auto}
        @media(max-width:700px){.yt-head{display:block}.yt-form{grid-template-columns:1fr}.yt-wide{grid-column:auto}}
      </style>
      <div class="ytlab">
        <div class="yt-head"><div><p class="eyebrow">YOUTUBE AGENT SKILLS</p><h2>🎬 YouTube Content Lab</h2><p class="muted">11 skills. Run a task to check the live AI connection; outputs can be reused in your content workflow.</p></div><span class="badge">AI STATUS CHECKED ON RUN</span></div>
        <div class="yt-grid">${skills.map(s=>`<button type="button" class="yt-skill ${s[0]===selected?"selected":""}" data-skill="${s[0]}"><b>${s[1]}</b><small>${s[3]}</small></button>`).join("")}</div>
        <div class="yt-work">
          <h3 id="ytSkillTitle">${skillById(selected)[1]}</h3>
          <div class="yt-form">
            <label>Topic / Main input<input id="ytTopic" placeholder="e.g. New Bodo song promotion"></label>
            <label>Language<select id="ytLanguage"><option>English</option><option>Hindi</option><option>Bodo</option><option>Assamese</option><option>Hindi + Bodo</option></select></label>
            <label>Format<select id="ytFormat"><option>Long Video</option><option>Short Video</option><option>Reel</option></select></label>
            <label>Target audience<input id="ytAudience" placeholder="e.g. Indian music listeners"></label>
            <label class="yt-wide">Transcript / Data / Notes<textarea id="ytNotes" placeholder="Paste transcript, comments, retention data, channel stats, or extra instructions depending on the selected skill."></textarea></label>
          </div>
          <div class="yt-actions"><button type="button" class="primary" id="ytRun">✨ Run YouTube Skill</button><button type="button" class="small-btn" id="ytThumb">🖼️ Generate Thumbnail</button><button type="button" class="small-btn" id="ytCopy">📋 Copy Result</button></div>
          <pre id="ytResult" class="yt-result">Select a skill and run it. Your existing content pipeline is not modified by this tool.</pre>
        </div>
      </div>`;
    view.querySelectorAll("[data-skill]").forEach(b=>b.onclick=()=>{
      const topic=document.getElementById("ytTopic")?.value||"";
      const language=document.getElementById("ytLanguage")?.value||"English";
      const format=document.getElementById("ytFormat")?.value||"Long Video";
      const audience=document.getElementById("ytAudience")?.value||"";
      const notes=document.getElementById("ytNotes")?.value||"";
      const previousResult=document.getElementById("ytResult")?.textContent||"Select a skill and run it.";
      selected=b.dataset.skill;render();
      document.getElementById("ytTopic").value=topic;
      document.getElementById("ytLanguage").value=language;
      document.getElementById("ytFormat").value=format;
      document.getElementById("ytAudience").value=audience;
      document.getElementById("ytNotes").value=notes;
      document.getElementById("ytResult").textContent=previousResult;
    });
    document.getElementById("ytRun").onclick=runSkill;
    document.getElementById("ytThumb").onclick=runThumbnail;
    document.getElementById("ytCopy").onclick=async()=>{
      const value=document.getElementById("ytResult")?.innerText||"";
      if(!value.trim()){return;}
      try{await navigator.clipboard.writeText(value);document.getElementById("ytCopy").textContent="✅ Copied";}
      catch(e){document.getElementById("ytResult").textContent="Copy failed in this browser. Select the result text and copy it manually.";}
    };
  }
  async function runSkill(){
    const s=skillById(selected),out=document.getElementById("ytResult");
    const topic=(document.getElementById("ytTopic")?.value||"").trim();
    const notes=(document.getElementById("ytNotes")?.value||"").trim();
    const audience=(document.getElementById("ytAudience")?.value||"").trim();
    if(!topic&&!notes){out.textContent="⚠️ Add a topic or paste the required transcript/data first.";return;}
    out.textContent="🤖 Running "+s[1]+"…";
    try{
      const r=await fetch(apiUrl("/api/ai/generate"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({
        task:"youtube_agent_"+selected,
        topic:topic||"Analyze the supplied YouTube input",
        category:"YouTube",
        language:document.getElementById("ytLanguage")?.value||"English",
        format:document.getElementById("ytFormat")?.value||"Long Video",
        notes:"Skill: "+s[1]+"\nTarget audience: "+audience+"\nUser input/data:\n"+notes
      })});
      const b=await r.json().catch(()=>({}));
      if(!r.ok||!b.ok)throw new Error(b.error||("HTTP "+r.status));
      out.textContent=b.output||"No output returned.";
    }catch(e){out.textContent="❌ "+(e.message||e);}
  }
  async function runThumbnail(){
    const out=document.getElementById("ytResult");
    const topic=(document.getElementById("ytTopic")?.value||"").trim();
    if(!topic){out.textContent="⚠️ Add a topic first.";return;}
    out.textContent="🖼️ Generating thumbnail…";
    try{
      const r=await fetch(apiUrl("/api/thumbnail/generate"),{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({topic,title:topic,style:"premium YouTube creator thumbnail; cinematic; clear focal subject; high contrast",language:document.getElementById("ytLanguage")?.value||"English"})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok||!b.ok)throw new Error(b.error||("HTTP "+r.status));
      out.innerHTML="";
      const img=document.createElement("img");img.src=b.dataUrl;img.alt="Generated YouTube thumbnail";img.style="max-width:100%;border-radius:12px;display:block";
      out.appendChild(img);
    }catch(e){out.textContent="❌ "+(e.message||e);}
  }
  window.renderYoutubeSkills=render;
})();