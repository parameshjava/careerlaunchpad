-- ============================================================================
-- 055_arith_chain_rule.sql
-- Question-bank seed: Arithmetic chapter "Chain Rule" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Direct/indirect proportion, men-days-hours-work, provisions/rations.
-- Exam-grade difficulty floor; answers independently recomputed & each correct option
-- re-derived (not trusting the source index); 4 distinct-valued options, one correct;
-- each carries a worked explanation. Depends on 023. Reuses the idempotent
-- _seed_arith_q helper (dollar-quoted). Safe to re-run.
-- ============================================================================

create or replace function public._seed_arith_q(p_chapter text, p_difficulty text, p_stem text, p_opts text[], p_correct int, p_explanation text) returns void language plpgsql as $$
declare v_subj uuid; v_chap uuid; v_qid uuid; i int;
begin
  select id into v_subj from public.subject where lower(name)='arithmetic' limit 1;
  if v_subj is null then raise exception 'Arithmetic subject not found (run 023 first)'; end if;
  select id into v_chap from public.chapter where subject_id=v_subj and lower(name)=lower(p_chapter) limit 1;
  if v_chap is null then raise exception 'Chapter % not found', p_chapter; end if;
  if exists (select 1 from public.question where chapter_id=v_chap and stem=p_stem) then return; end if;
  insert into public.question (subject_id, chapter_id, kind, difficulty, answer_type, stem, explanation)
  values (v_subj, v_chap, 'standard', p_difficulty, 'single', p_stem, p_explanation) returning id into v_qid;
  for i in 1..array_length(p_opts,1) loop
    insert into public.question_option (question_id, label, is_correct, position) values (v_qid, p_opts[i], i=p_correct, i-1);
  end loop;
end; $$;

-- Chain Rule (40 questions)
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$If 15 men can build a wall in 42 hours, how many men are required to build the same wall in 30 hours?$q$,array[$q$18$q$,$q$21$q$,$q$25$q$,$q$28$q$],2,$q$Indirect: men × hours constant. 15×42=M×30 ⇒ M=630/30=21.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$36 workers can dig a trench in 12 days. How many days will 27 workers take to dig the same trench?$q$,array[$q$14$q$,$q$15$q$,$q$16$q$,$q$18$q$],3,$q$Fewer workers, more days. 36×12=27×D ⇒ D=432/27=16.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$If 15 men can reap 40 acres of a field, how many acres can 24 men reap in the same time?$q$,array[$q$56$q$,$q$60$q$,$q$64$q$,$q$72$q$],3,$q$Direct: acres ∝ men. 40/15=A/24 ⇒ A=40×24/15=64.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$8 men can complete a piece of work in 24 days. In how many days can 12 men complete the same work?$q$,array[$q$12$q$,$q$14$q$,$q$16$q$,$q$18$q$],3,$q$Indirect. 8×24=12×D ⇒ D=192/12=16.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$20 men can finish a job in 15 days. How many men are needed to finish the same job in 10 days?$q$,array[$q$25$q$,$q$28$q$,$q$30$q$,$q$32$q$],3,$q$Indirect. 20×15=M×10 ⇒ M=300/10=30.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$A car covers 528 km using 44 litres of petrol. How far can it travel on 30 litres?$q$,array[$q$330 km$q$,$q$345 km$q$,$q$360 km$q$,$q$400 km$q$],3,$q$Direct: km ∝ litres. 528/44=12 km/L; 12×30=360.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$6 identical pipes can fill a tank in 1 hour 20 minutes. How many such pipes are needed to fill it in 48 minutes?$q$,array[$q$8$q$,$q$9$q$,$q$10$q$,$q$12$q$],3,$q$80 min with 6 pipes; indirect. 6×80=P×48 ⇒ P=480/48=10.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$If 12 men earn ₹1500 for a certain piece of work, how much would 8 men earn for the same rate of work?$q$,array[$q$₹900$q$,$q$₹1000$q$,$q$₹1100$q$,$q$₹1200$q$],2,$q$Direct: earning ∝ men. 1500/12=125; 125×8=1000.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$If 6 kg of sugar costs ₹210, what is the cost of 8 kg of the same sugar?$q$,array[$q$₹240$q$,$q$₹260$q$,$q$₹280$q$,$q$₹300$q$],3,$q$Direct. 210/6=35 per kg; 35×8=280.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'easy',$q$21 cows can graze a field in 42 days. In how many days can 42 cows graze the same field?$q$,array[$q$18$q$,$q$20$q$,$q$21$q$,$q$24$q$],3,$q$Indirect. 21×42=42×D ⇒ D=882/42=21.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$8 men can do a piece of work in 12 days. In how many days can 6 men do the same work?$q$,array[$q$14$q$,$q$15$q$,$q$16$q$,$q$18$q$],3,$q$Indirect. 8×12=6×D ⇒ D=96/6=16.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$30 men can build a wall in 20 days. In how many days can 25 men build the same wall?$q$,array[$q$22$q$,$q$24$q$,$q$25$q$,$q$26$q$],2,$q$Indirect. 30×20=25×D ⇒ D=600/25=24.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$6 pumps working 8 hours a day can fill a reservoir in 1 day. How many hours a day must 4 pumps work to fill it in 1 day?$q$,array[$q$10$q$,$q$12$q$,$q$14$q$,$q$16$q$],2,$q$Indirect: pumps × hours constant. 6×8=4×H ⇒ H=48/4=12.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$If 3 men working for 4 days earn ₹600, how much will 5 men earn working for 6 days at the same rate?$q$,array[$q$₹1200$q$,$q$₹1350$q$,$q$₹1500$q$,$q$₹1800$q$],3,$q$Earning ∝ men×days. Rate=600/(3×4)=50/man-day; 50×(5×6)=1500.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$12 carpenters working 8 hours a day complete a job in 24 days. Working 6 hours a day, how many days will the same 12 carpenters take?$q$,array[$q$28$q$,$q$30$q$,$q$32$q$,$q$36$q$],3,$q$Indirect on hours. 8×24=6×D ⇒ D=192/6=32.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$20 men working 8 days can weave 640 mats. How many mats can 24 men weave in 12 days?$q$,array[$q$960$q$,$q$1080$q$,$q$1152$q$,$q$1280$q$],3,$q$Mats ∝ men×days. 640/(20×8)=4; 4×(24×12)=1152.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$If 5 machines take 5 minutes to make 5 items, how long will 100 machines take to make 100 items?$q$,array[$q$5 minutes$q$,$q$20 minutes$q$,$q$100 minutes$q$,$q$1 minute$q$],1,$q$1 machine makes 1 item in 5 min; 100 machines make 100 items in 5 min.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$If 7 spiders spin 7 webs in 7 days, in how many days will 1 spider spin 1 web?$q$,array[$q$1$q$,$q$3$q$,$q$5$q$,$q$7$q$],4,$q$1 spider spins 1 web in 7 days (rate unchanged).$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$18 men can complete a work in 20 days. If the work must be finished in 18 days, how many men are required?$q$,array[$q$18$q$,$q$20$q$,$q$22$q$,$q$24$q$],2,$q$Indirect. 18×20=M×18 ⇒ M=360/18=20.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'medium',$q$10 cows eat 10 bags of fodder in 10 days. In how many days will 20 cows eat 20 bags?$q$,array[$q$5$q$,$q$10$q$,$q$20$q$,$q$40$q$],2,$q$1 cow eats 1 bag in 10 days; 20 cows eat 20 bags in the same 10 days.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$39 persons can repair a road in 12 days working 5 hours a day. In how many days will 30 persons complete the same work if they work 6 hours a day?$q$,array[$q$11$q$,$q$13$q$,$q$15$q$,$q$16$q$],2,$q$M1D1H1=M2D2H2. 39×12×5=30×D×6 ⇒ D=2340/180=13.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$12 men working 8 hours a day finish a work in 10 days. How many days will 16 men working 6 hours a day take to finish it?$q$,array[$q$8$q$,$q$9$q$,$q$10$q$,$q$12$q$],3,$q$12×8×10=16×6×D ⇒ D=960/96=10.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$10 men working 8 hours a day can build a wall in 6 days. Working 6 hours a day, in how many days can 8 men build the same wall?$q$,array[$q$8$q$,$q$9$q$,$q$10$q$,$q$12$q$],3,$q$10×6×8=8×6×D ⇒ D=480/48=10.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$40 men working 8 hours a day dig 200 m of canal in 12 days. How many men are needed to dig 300 m of canal in 15 days working 6 hours a day?$q$,array[$q$48$q$,$q$56$q$,$q$60$q$,$q$64$q$],4,$q$M1D1H1/W1=M2D2H2/W2. M=40×12×8×300/(200×15×6)=1,152,000/18,000=64.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$27 men working 6 hours a day finish a task in 8 days. In how many days will 18 men working 9 hours a day finish the same task?$q$,array[$q$6$q$,$q$7$q$,$q$8$q$,$q$9$q$],3,$q$27×6×8=18×9×D ⇒ D=1296/162=8.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$24 men working 9 hours a day complete a work in 10 days. In how many days will 30 men working 8 hours a day complete it?$q$,array[$q$8$q$,$q$9$q$,$q$10$q$,$q$12$q$],2,$q$24×9×10=30×8×D ⇒ D=2160/240=9.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$16 men working 10 hours a day finish a project in 12 days. How many hours a day must 20 men work to finish it in 8 days?$q$,array[$q$10$q$,$q$12$q$,$q$14$q$,$q$15$q$],2,$q$16×10×12=20×8×H ⇒ H=1920/160=12.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$45 men working 6 hours a day complete a work in 16 days. In how many days will 30 men working 8 hours a day complete the same work?$q$,array[$q$16$q$,$q$18$q$,$q$20$q$,$q$24$q$],2,$q$45×6×16=30×8×D ⇒ D=4320/240=18.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$12 men working 8 hours a day finish a work in 6 days. How many hours a day must 9 men work to finish the same work in 8 days?$q$,array[$q$6$q$,$q$8$q$,$q$9$q$,$q$10$q$],2,$q$12×8×6=9×8×H ⇒ H=576/72=8.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'hard',$q$10 examiners working 5 hours a day grade 2000 papers in 8 days. In how many days will 15 examiners working 4 hours a day grade 3000 papers?$q$,array[$q$8$q$,$q$10$q$,$q$12$q$,$q$15$q$],2,$q$D=10×5×8×3000/(2000×15×4)=1,200,000/120,000=10.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$A garrison of 2000 men has provisions for 54 days. After 15 days, a reinforcement of 1000 men arrives. For how many more days will the remaining provisions last?$q$,array[$q$24$q$,$q$26$q$,$q$28$q$,$q$30$q$],2,$q$Food left=2000×(54−15)=78000 man-days; now 3000 men ⇒ 78000/3000=26.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$A fort had provisions for 1200 men for 28 days. After 4 days, 400 men left the fort. For how many more days will the remaining provisions last the remaining men?$q$,array[$q$32$q$,$q$34$q$,$q$36$q$,$q$40$q$],3,$q$Food left=1200×(28−4)=28800; now 800 men ⇒ 28800/800=36.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$20 men working 8 hours a day build 300 m of a wall in 10 days. In how many days will 25 men working 8 hours a day build 450 m of a similar wall?$q$,array[$q$10$q$,$q$11$q$,$q$12$q$,$q$14$q$],3,$q$D=20×10×8×450/(300×25×8)=720,000/60,000=12.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$21 men working 8 hours a day dig a trench 60 m long in 25 days. In how many days will 15 men working 5 hours a day dig a trench 45 m long?$q$,array[$q$36$q$,$q$40$q$,$q$42$q$,$q$45$q$],3,$q$D=21×25×8×45/(60×15×5)=189,000/4500=42.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$1200 soldiers have food for 30 days, eating 3 meals a day. If 300 more soldiers join and everyone reduces to 2 meals a day, for how many days will the food last?$q$,array[$q$30$q$,$q$32$q$,$q$34$q$,$q$36$q$],4,$q$Total meals=1200×30×3=108000; now 1500×2=3000/day ⇒ 108000/3000=36.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$200 men working 8 hours a day complete half of a wall in 15 days. If 100 more men join and all work 10 hours a day, in how many days will the remaining half be completed?$q$,array[$q$6$q$,$q$8$q$,$q$10$q$,$q$12$q$],2,$q$½ needs 200×15×8 man-hrs. Remaining ½ with 300 men,10 hr/day: D=24000/(300×10)=8.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$6 men working 8 hours a day weave 90 m of cloth in 15 days. In how many days will 9 men working 6 hours a day weave 135 m of the same cloth?$q$,array[$q$18$q$,$q$20$q$,$q$22$q$,$q$24$q$],2,$q$D=6×15×8×135/(90×9×6)=97,200/4860=20.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$100 men working 8 hours a day complete one-fourth of a dam in 50 days. If 200 men now work 12 hours a day, in how many days will they complete the remaining three-fourths?$q$,array[$q$45$q$,$q$48$q$,$q$50$q$,$q$55$q$],3,$q$¼ needs 100×50×8=40000 man-hr; ¾ needs 120000; /(200×12)=120000/2400=50.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$35 workers working 8 hours a day pack 1680 boxes in 6 days. In how many days will 40 workers working 7 hours a day pack 2800 boxes?$q$,array[$q$8$q$,$q$10$q$,$q$12$q$,$q$14$q$],2,$q$D=35×6×8×2800/(1680×40×7)=4,704,000/470,400=10.$q$);
select public._seed_arith_q($q$Chain Rule$q$,'very_hard',$q$A camp of 1000 men has rations for 60 days. After 15 days, 400 men are transferred out. For how many more days will the rations last the remaining men?$q$,array[$q$60$q$,$q$65$q$,$q$70$q$,$q$75$q$],4,$q$Food left=1000×(60−15)=45000 man-days; now 600 men ⇒ 45000/600=75.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
