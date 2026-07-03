-- ============================================================================
-- 058_arith_time_and_distance.sql
-- Question-bank seed: Arithmetic chapter "Time and Distance" -- 40 single-answer MCQs
-- from ACTUAL previous-year papers (SBI/IBPS/RBI/Canara PO & Clerk, SSC CGL/CHSL,
-- TS/AP ICET, TCS NQT/Infosys/Wipro/Cognizant) via IndiaBix, PrepInsta, Testbook,
-- Adda247, Oliveboard, CareerPower, Examveda, 2IIM, GeeksforGeeks, Sawaal.
-- Speed/conversion, average speed, late/early, relative speed, circular track, %-speed.
-- Exam-grade floor; answers independently recomputed; 4 distinct-valued options,
-- one correct; each carries a worked explanation. Depends on 023. Reuses the
-- idempotent _seed_arith_q helper (dollar-quoted). Safe to re-run.
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

-- Time and Distance (40 questions)
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A car travels 240 km in 4 hours. What is its average speed?$q$,array[$q$50 km/h$q$,$q$60 km/h$q$,$q$70 km/h$q$,$q$80 km/h$q$],2,$q$Speed = distance/time = 240/4 = 60 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$Convert a speed of 72 km/h into metres per second.$q$,array[$q$18 m/s$q$,$q$20 m/s$q$,$q$22 m/s$q$,$q$25 m/s$q$],2,$q$m/s = km/h × 5/18 = 72 × 5/18 = 20 m/s.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A body moves at 25 m/s. Express this speed in km/h.$q$,array[$q$75 km/h$q$,$q$80 km/h$q$,$q$90 km/h$q$,$q$100 km/h$q$],3,$q$km/h = m/s × 18/5 = 25 × 18/5 = 90 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A man walks at 6 km/h. How far does he walk in 30 minutes?$q$,array[$q$2 km$q$,$q$3 km$q$,$q$4 km$q$,$q$6 km$q$],2,$q$Distance = 6 × (30/60) = 3 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$How long does it take to cover 150 km at a steady 50 km/h?$q$,array[$q$2 hours$q$,$q$2.5 hours$q$,$q$3 hours$q$,$q$3.5 hours$q$],3,$q$Time = distance/speed = 150/50 = 3 hours.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A cyclist rides at 45 km/h for 3 hours. What distance does he cover?$q$,array[$q$120 km$q$,$q$130 km$q$,$q$135 km$q$,$q$150 km$q$],3,$q$Distance = speed × time = 45 × 3 = 135 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A sprinter runs at 15 m/s. How far does he go in 20 seconds?$q$,array[$q$250 m$q$,$q$300 m$q$,$q$320 m$q$,$q$350 m$q$],2,$q$Distance = 15 × 20 = 300 m.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A bus maintains 60 km/h. What distance does it cover in 2 hours 30 minutes?$q$,array[$q$120 km$q$,$q$140 km$q$,$q$150 km$q$,$q$160 km$q$],3,$q$Time = 2.5 h; distance = 60 × 2.5 = 150 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A runner moves at 25 m/s. How many seconds to cover 500 m?$q$,array[$q$18 s$q$,$q$20 s$q$,$q$22 s$q$,$q$25 s$q$],2,$q$Time = 500/25 = 20 s.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'easy',$q$A person covers 300 metres in 1 minute. What is his speed in km/h?$q$,array[$q$15 km/h$q$,$q$16 km/h$q$,$q$18 km/h$q$,$q$20 km/h$q$],3,$q$300 m/min = 300 × 60 = 18000 m/h = 18 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$Walking to school at 5 km/h a boy is 7 minutes late; at 6 km/h he is 5 minutes early. Find the distance to school.$q$,array[$q$5 km$q$,$q$6 km$q$,$q$7 km$q$,$q$8 km$q$],2,$q$d/5 − d/6 = 12/60 h ⇒ d/30 = 1/5 ⇒ d = 6 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A man goes to a place at 40 km/h and returns at 60 km/h. What is his average speed for the whole journey?$q$,array[$q$46 km/h$q$,$q$48 km/h$q$,$q$50 km/h$q$,$q$52 km/h$q$],2,$q$Avg = 2·40·60/(40+60) = 4800/100 = 48 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A student walking at 3 km/h reaches college 40 minutes late; at 4 km/h he would take 40 minutes less. Find the distance.$q$,array[$q$6 km$q$,$q$7 km$q$,$q$8 km$q$,$q$9 km$q$],3,$q$d/3 − d/4 = 40/60 h ⇒ d/12 = 2/3 ⇒ d = 8 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A man reduces his speed to two-thirds of the usual and reaches office 20 minutes late. What is his usual travel time?$q$,array[$q$30 min$q$,$q$40 min$q$,$q$45 min$q$,$q$50 min$q$],2,$q$Time becomes 3/2 of usual; extra = t/2 = 20 ⇒ t = 40 min.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$Reaching a station at 50 km/h a driver arrives at 12:00, but at 60 km/h he would arrive at 11:00. Find the distance.$q$,array[$q$250 km$q$,$q$280 km$q$,$q$300 km$q$,$q$320 km$q$],3,$q$d/50 − d/60 = 1 h ⇒ d/300 = 1 ⇒ d = 300 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A cyclist covers 12 km at 12 km/h and returns the same 12 km at 8 km/h. Find his average speed.$q$,array[$q$9.6 km/h$q$,$q$10 km/h$q$,$q$10.4 km/h$q$,$q$11 km/h$q$],1,$q$Equal distances ⇒ avg = 2·12·8/(12+8) = 192/20 = 9.6 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A person walks at four-fifths of his usual speed and reaches work 10 minutes late. What is his usual time?$q$,array[$q$30 min$q$,$q$35 min$q$,$q$40 min$q$,$q$45 min$q$],3,$q$Time = 5/4 of usual; extra = t/4 = 10 ⇒ t = 40 min.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$Increasing speed from 10 km/h to 15 km/h saves 30 minutes on a trip. Find the distance.$q$,array[$q$12 km$q$,$q$15 km$q$,$q$18 km$q$,$q$20 km$q$],2,$q$d/10 − d/15 = 1/2 h ⇒ d/30 = 1/2 ⇒ d = 15 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A man walks the first half of a 24 km journey at 4 km/h and the second half at 6 km/h. Total time taken?$q$,array[$q$4 h$q$,$q$4.5 h$q$,$q$5 h$q$,$q$5.5 h$q$],3,$q$12/4 + 12/6 = 3 + 2 = 5 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'medium',$q$A car covers a distance at 45 km/h in 4 hours. To cover the same distance in 3 hours, what speed is needed?$q$,array[$q$55 km/h$q$,$q$60 km/h$q$,$q$65 km/h$q$,$q$70 km/h$q$],2,$q$Distance = 45×4 = 180 km; speed = 180/3 = 60 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$B starts walking at 6 km/h. Two hours later A starts from the same point at 10 km/h in the same direction. How far from the start does A catch B?$q$,array[$q$24 km$q$,$q$28 km$q$,$q$30 km$q$,$q$36 km$q$],3,$q$Head start = 12 km; catch time = 12/(10−6) = 3 h; A's distance = 10×3 = 30 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$Two towns are 100 km apart. Two cyclists start toward each other at 30 km/h and 20 km/h. After how long do they meet?$q$,array[$q$1.5 h$q$,$q$2 h$q$,$q$2.5 h$q$,$q$3 h$q$],2,$q$Closing speed = 50 km/h; time = 100/50 = 2 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$The speeds of A and B are in the ratio 4:5. If B takes 2 hours less than A over the same distance, how long does A take?$q$,array[$q$8 h$q$,$q$9 h$q$,$q$10 h$q$,$q$12 h$q$],3,$q$Times are in ratio 5:4; difference 1 part = 2 h ⇒ A = 5×2 = 10 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$A 100 km trip is covered as 60 km at 30 km/h and the remaining 40 km at 20 km/h. Find the average speed.$q$,array[$q$24 km/h$q$,$q$25 km/h$q$,$q$26 km/h$q$,$q$28 km/h$q$],2,$q$Total time = 60/30 + 40/20 = 2 + 2 = 4 h; avg = 100/4 = 25 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$Two runners start from the same point at the same time in opposite directions at 4 km/h and 6 km/h. How far apart are they after 3 hours?$q$,array[$q$24 km$q$,$q$30 km$q$,$q$36 km$q$,$q$40 km$q$],2,$q$Separation speed = 10 km/h; distance = 10×3 = 30 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$A thief running at 10 km/h is spotted 1 km ahead by a policeman who chases at 11 km/h. How far does the policeman run to catch him?$q$,array[$q$10 km$q$,$q$11 km$q$,$q$12 km$q$,$q$13 km$q$],2,$q$Catch time = 1/(11−10) = 1 h; policeman's distance = 11×1 = 11 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$The speeds of two cars are in the ratio 3:4. Over the same route the faster car reaches 30 minutes earlier. How long does the slower car take?$q$,array[$q$90 min$q$,$q$100 min$q$,$q$110 min$q$,$q$120 min$q$],4,$q$Times ratio 4:3; diff 1 part = 30 min ⇒ slower = 4×30 = 120 min.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$A walks at 5 km/h. B starts cycling from the same point 30 minutes later at 20 km/h in the same direction. After how many minutes does B catch A?$q$,array[$q$8 min$q$,$q$10 min$q$,$q$12 min$q$,$q$15 min$q$],2,$q$Head start = 5×0.5 = 2.5 km; catch time = 2.5/(20−5) = 1/6 h = 10 min.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$A person walking hears two gunshots 20 minutes apart, though they were actually fired 21 minutes apart. If sound travels at 330 m/s, at what speed is he moving toward the source?$q$,array[$q$15 m/s$q$,$q$16 m/s$q$,$q$16.5 m/s$q$,$q$18 m/s$q$],3,$q$In 20 min he covers what sound covers in 1 min: 330×60 m over 20×60 s = 16.5 m/s.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'hard',$q$Two friends leave the same point at the same time, one at 12 km/h and the other at 18 km/h in opposite directions. When are they 45 km apart?$q$,array[$q$1 h$q$,$q$1.5 h$q$,$q$2 h$q$,$q$2.5 h$q$],2,$q$Separation speed = 30 km/h; time = 45/30 = 1.5 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$A driver increases his speed by 25% and reaches his destination 1 hour earlier than usual. What is his usual travelling time?$q$,array[$q$4 h$q$,$q$4.5 h$q$,$q$5 h$q$,$q$6 h$q$],3,$q$New time = t/1.25 = 0.8t; saving 0.2t = 1 h ⇒ t = 5 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$If a man reduces his speed by 20%, he reaches office 1 hour later than usual. What is his usual travel time?$q$,array[$q$3 h$q$,$q$4 h$q$,$q$5 h$q$,$q$6 h$q$],2,$q$New time = t/0.8 = 1.25t; extra 0.25t = 1 h ⇒ t = 4 h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$On a circular track of length 300 m, two runners start together at the same point moving in opposite directions at 5 m/s and 3 m/s. How often do they meet?$q$,array[$q$every 30 s$q$,$q$every 37.5 s$q$,$q$every 45 s$q$,$q$every 60 s$q$],2,$q$Opposite ⇒ combined 8 m/s; meet every 300/8 = 37.5 s.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$On a 400 m circular track, A runs at 8 m/s and B at 5 m/s in the same direction from the same point. After how long does A gain a full lap on B?$q$,array[$q$100 s$q$,$q$400/3 s$q$,$q$150 s$q$,$q$200 s$q$],2,$q$Same direction ⇒ relative 3 m/s; A laps B after 400/3 s ≈ 133.3 s.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$A journey is split into three equal distances covered at 20, 30 and 60 km/h respectively. Find the average speed for the whole journey.$q$,array[$q$30 km/h$q$,$q$33.3 km/h$q$,$q$36 km/h$q$,$q$40 km/h$q$],1,$q$Avg = 3/(1/20+1/30+1/60) = 3/(6/60) = 30 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$A goes to office at 30 km/h and is 5 minutes late; at 45 km/h he is 5 minutes early. Find the distance to office.$q$,array[$q$12 km$q$,$q$15 km$q$,$q$18 km$q$,$q$20 km$q$],2,$q$d/30 − d/45 = 10/60 h ⇒ d/90 = 1/6 ⇒ d = 15 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$Over 150 km, increasing speed by 5 km/h would save 1 hour. What is the original speed?$q$,array[$q$20 km/h$q$,$q$25 km/h$q$,$q$30 km/h$q$,$q$35 km/h$q$],2,$q$150/v − 150/(v+5) = 1 ⇒ v²+5v−750 = 0 ⇒ v = 25 km/h.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$Two cars travel from A to B. One at 60 km/h arrives 1 hour before the other at 40 km/h. Find the distance AB.$q$,array[$q$100 km$q$,$q$110 km$q$,$q$120 km$q$,$q$140 km$q$],3,$q$d/40 − d/60 = 1 ⇒ d/120 = 1 ⇒ d = 120 km.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$A leaves P for Q (555 km away) at 6 am at 60 km/h. B leaves Q for P at 7 am at 75 km/h. At what time do they meet?$q$,array[$q$10:20 am$q$,$q$10:40 am$q$,$q$11:00 am$q$,$q$11:20 am$q$],2,$q$By 7 am A covered 60 km; gap 495 km, closing 135 km/h ⇒ 495/135 = 3h40m after 7 am = 10:40 am.$q$);
select public._seed_arith_q($q$Time and Distance$q$,'very_hard',$q$A person misses his bus by 12 minutes if he walks at 5 km/h, but reaches 10 minutes early at 6 km/h. Find the distance to the bus stop.$q$,array[$q$9 km$q$,$q$10 km$q$,$q$11 km$q$,$q$12 km$q$],3,$q$d/5 − d/6 = 22/60 h ⇒ d/30 = 11/30 ⇒ d = 11 km.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
