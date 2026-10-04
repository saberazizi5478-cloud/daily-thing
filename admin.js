'use strict';
const { createClient } = window.supabase;
const db = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const msg = (t,ok=false) => { $('adminMsg').textContent=t; $('adminMsg').className=`msg ${ok?'ok':''}`; };
async function checkAccess(){
  const {data,error}=await db.auth.getUser();
  if(error||!data.user){ $('gate').innerHTML='<h2>ورود لازم است</h2><p>ابتدا با Google وارد اپ شو.</p><a class="primary link" href="./index.html">ورود با Google</a>'; return; }
  const {data:isAdmin,error:adminError}=await db.rpc('is_admin');
  if(adminError||isAdmin!==true){ $('gate').innerHTML='<h2>دسترسی غیرمجاز</h2><p>این حساب هنوز نقش مدیر ندارد.</p>'; return; }
  $('gate').classList.add('hidden'); $('panel').classList.remove('hidden'); await loadList();
}
async function loadList(){
  const {data,error}=await db.from('daily_content').select('id,type,title,points,status,publish_at,created_at').order('created_at',{ascending:false}).limit(30);
  if(error){$('contentList').innerHTML='<div class="empty">دریافت محتوا ناموفق بود.</div>';return;}
  $('contentList').innerHTML=data?.length?data.map(x=>`<div class="item"><div><b>${esc(x.title)}</b><br><small>${esc(x.type)} · ${esc(x.points)} امتیاز · ${esc(x.status)}</small></div><span>${new Date(x.publish_at).toLocaleDateString('fa-IR')}</span></div>`).join(''):'<div class="empty">هنوز محتوایی ساخته نشده.</div>';
}
function isoFromInput(id){const v=$(id).value;return v?new Date(v).toISOString():null;}
$('contentForm').addEventListener('submit',async e=>{
  e.preventDefault(); msg('در حال انتشار...');
  const type=$('type').value,title=$('title').value.trim(),body=$('body').value.trim(),points=Math.max(1,Math.min(1000,Number($('points').value)||10));
  const publish_at=isoFromInput('publishAt')||new Date().toISOString(),expires_at=isoFromInput('expiresAt');
  if(expires_at&&new Date(expires_at)<=new Date(publish_at)) return msg('زمان پایان باید بعد از زمان انتشار باشد.');
  const opts=[...document.querySelectorAll('.opt')].map(x=>x.value.trim()).filter(Boolean);
  if(type==='quiz'&&opts.length<2) return msg('برای Quiz حداقل دو گزینه لازم است.');
  if(opts.length>4) return msg('حداکثر چهار گزینه مجاز است.');
  const {data,error}=await db.from('daily_content').insert({type,title,body,points,publish_at,expires_at,status:'published'}).select('id').single();
  if(error){msg('انتشار انجام نشد.');console.error(error);return;}
  if(opts.length){
    const correct=Math.max(1,Math.min(opts.length,Number($('correct').value)||1));
    const rows=opts.map((text,i)=>({content_id:data.id,text,is_correct:type==='quiz'&&i===correct-1,sort_order:i+1}));
    const r=await db.from('content_options').insert(rows);
    if(r.error){await db.from('daily_content').delete().eq('id',data.id);msg('ثبت گزینه‌ها ناموفق بود.');console.error(r.error);return;}
  }
  msg('محتوا با موفقیت منتشر شد ✅',true); e.target.reset(); $('points').value=10; $('correct').value=1; await loadList();
});

db.auth.onAuthStateChange(()=>setTimeout(checkAccess,0));
checkAccess();
