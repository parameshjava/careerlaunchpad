-- ============================================================================
-- 068_arith_clocks.sql
-- Question-bank seed: Arithmetic chapter "Clocks" -- 36 single-answer MCQs
-- from ACTUAL previous-year papers / standard aptitude texts (bank PO/Clerk, SSC,
-- ICET, IT placement). Exam-grade floor; answers independently recomputed & each
-- correct option verified; 4 distinct-valued options, one correct; each carries a
-- worked explanation. Depends on 023. Reuses idempotent _seed_arith_q. Safe to re-run.
-- Hand angles |30H-5.5M|, coincidence/right-angle/opposite times, faulty & mirror clocks.
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

-- Clocks (36 questions)
select public._seed_arith_q($q$Clocks$q$,'easy',$q$What is the angle between the hour hand and the minute hand of a clock at exactly 3:00?$q$,array[$q$60°$q$,$q$90°$q$,$q$120°$q$,$q$45°$q$],2,$q$|30·3 − 5.5·0| = 90°.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$What is the angle between the hour and minute hands at exactly 5 o'clock?$q$,array[$q$150°$q$,$q$120°$q$,$q$135°$q$,$q$160°$q$],1,$q$|30·5 − 5.5·0| = 150°.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$How many degrees does the minute hand of a clock move in 20 minutes?$q$,array[$q$100°$q$,$q$110°$q$,$q$120°$q$,$q$130°$q$],3,$q$Minute hand = 6°/min, so 6·20 = 120°.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$How many degrees does the hour hand of a clock move in 48 minutes?$q$,array[$q$18°$q$,$q$20°$q$,$q$24°$q$,$q$30°$q$],3,$q$Hour hand = 0.5°/min, so 0.5·48 = 24°.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$In 12 hours, how many times do the hour and minute hands of a clock coincide?$q$,array[$q$12$q$,$q$24$q$,$q$10$q$,$q$11$q$],4,$q$Hands coincide 11 times in 12 hours (22 times in 24 h).$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$What is the angle between the two hands of a clock at exactly 6:00?$q$,array[$q$150°$q$,$q$180°$q$,$q$120°$q$,$q$90°$q$],2,$q$|30·6 − 5.5·0| = 180° (hands opposite).$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$In 24 hours, how many times are the hour and minute hands of a clock at right angles?$q$,array[$q$22$q$,$q$48$q$,$q$44$q$,$q$24$q$],3,$q$Right angles occur 22 times per 12 h, so 44 times in 24 h.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$What is the angle between the hour and minute hands at exactly 2 o'clock?$q$,array[$q$45°$q$,$q$30°$q$,$q$60°$q$,$q$90°$q$],3,$q$|30·2 − 5.5·0| = 60°.$q$);
select public._seed_arith_q($q$Clocks$q$,'easy',$q$The minute hand of a clock overtakes the hour hand at intervals of how many minutes of correct time?$q$,array[$q$60 min$q$,$q$65 5/11 min$q$,$q$72 min$q$,$q$66 min$q$],2,$q$Minute hand gains 55 min-spaces in 60 min; time to gain 60 = 720/11 = 65 5/11 min.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$What is the angle between the hour and minute hands at 3:20?$q$,array[$q$20°$q$,$q$15°$q$,$q$25°$q$,$q$30°$q$],1,$q$|30·3 − 5.5·20| = |90 − 110| = 20°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$Find the angle between the two hands of a clock at 4:40.$q$,array[$q$90°$q$,$q$120°$q$,$q$100°$q$,$q$110°$q$],3,$q$|30·4 − 5.5·40| = |120 − 220| = 100°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$What is the angle between the hands of a clock at 2:30?$q$,array[$q$75°$q$,$q$95°$q$,$q$120°$q$,$q$105°$q$],4,$q$|30·2 − 5.5·30| = |60 − 165| = 105°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$Find the smaller angle between the hands of a clock at 7:35.$q$,array[$q$17.5°$q$,$q$20°$q$,$q$15°$q$,$q$22.5°$q$],1,$q$|30·7 − 5.5·35| = |210 − 192.5| = 17.5°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$What is the angle between the hour and minute hands at 9:15?$q$,array[$q$180°$q$,$q$172.5°$q$,$q$162.5°$q$,$q$165°$q$],2,$q$|30·9 − 5.5·15| = |270 − 82.5| = 187.5°; reflex → 360 − 187.5 = 172.5°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$Find the angle between the hands of a clock at 8:20.$q$,array[$q$120°$q$,$q$140°$q$,$q$130°$q$,$q$110°$q$],3,$q$|30·8 − 5.5·20| = |240 − 110| = 130°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$How many times in 12 hours are the hour and minute hands of a clock at right angles?$q$,array[$q$24$q$,$q$22$q$,$q$20$q$,$q$44$q$],2,$q$Right angles occur 22 times in 12 hours (they nearly coincide near 3 & 9, losing 2).$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$What is the angle between the hands of a clock at 5:24?$q$,array[$q$12°$q$,$q$24°$q$,$q$18°$q$,$q$15°$q$],3,$q$|30·5 − 5.5·24| = |150 − 132| = 18°.$q$);
select public._seed_arith_q($q$Clocks$q$,'medium',$q$Find the smaller angle between the hands of a clock at 10:10.$q$,array[$q$115°$q$,$q$125°$q$,$q$105°$q$,$q$95°$q$],1,$q$|30·10 − 5.5·10| = |300 − 55| = 245°; reflex → 360 − 245 = 115°.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 4 and 5 o'clock will the hands of a clock coincide?$q$,array[$q$21 9/11 min past 4$q$,$q$22 min past 4$q$,$q$20 min past 4$q$,$q$21 min past 4$q$],1,$q$Coincide: 30·4 = 5.5M ⇒ M = 240/11 = 21 9/11 min past 4.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 5 and 6 o'clock will the two hands of a clock be together?$q$,array[$q$25 min past 5$q$,$q$27 3/11 min past 5$q$,$q$28 min past 5$q$,$q$26 4/11 min past 5$q$],2,$q$30·5 = 5.5M ⇒ M = 300/11 = 27 3/11 min past 5.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 2 and 3 o'clock will the hands of a clock be in opposite directions (180° apart)?$q$,array[$q$42 min past 2$q$,$q$44 min past 2$q$,$q$43 7/11 min past 2$q$,$q$45 min past 2$q$],3,$q$Opposite: 5.5M − 60 = 180 ⇒ M = 480/11 = 43 7/11 min past 2.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 4 and 5 o'clock will the hands of a clock point in opposite directions?$q$,array[$q$54 6/11 min past 4$q$,$q$53 min past 4$q$,$q$55 min past 4$q$,$q$54 min past 4$q$],1,$q$5.5M − 120 = 180 ⇒ M = 600/11 = 54 6/11 min past 4.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 3 and 4 o'clock will the hands of a clock be at right angles?$q$,array[$q$31 min past 3$q$,$q$32 8/11 min past 3$q$,$q$33 min past 3$q$,$q$30 min past 3$q$],2,$q$90° after coincidence: 5.5M − 90 = 90 ⇒ M = 360/11 = 32 8/11 min past 3.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 6 and 7 o'clock will the hands of a clock make a right angle (first time)?$q$,array[$q$15 min past 6$q$,$q$16 4/11 min past 6$q$,$q$17 min past 6$q$,$q$18 2/11 min past 6$q$],2,$q$180 − 5.5M = 90 ⇒ M = 180/11 = 16 4/11 min past 6.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 2 and 3 o'clock will the hands of a clock be at right angles?$q$,array[$q$27 3/11 min past 2$q$,$q$28 min past 2$q$,$q$26 min past 2$q$,$q$25 5/11 min past 2$q$],1,$q$5.5M − 60 = 90 ⇒ M = 300/11 = 27 3/11 min past 2.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 7 and 8 o'clock will the hands of a clock be in a straight line but not together (opposite)?$q$,array[$q$6 min past 7$q$,$q$4 5/11 min past 7$q$,$q$5 5/11 min past 7$q$,$q$7 min past 7$q$],3,$q$5.5M + 30 = ... i.e. 210 − 5.5M = 180 ⇒ M = 60/11 = 5 5/11 min past 7.$q$);
select public._seed_arith_q($q$Clocks$q$,'hard',$q$At what time between 7 and 8 o'clock will the two hands of a clock coincide?$q$,array[$q$37 min past 7$q$,$q$38 2/11 min past 7$q$,$q$39 min past 7$q$,$q$38 min past 7$q$],2,$q$30·7 = 5.5M ⇒ M = 420/11 = 38 2/11 min past 7.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A clock gains 3 minutes per hour. If it is set to the correct time at 12:00 noon, what is the true time when the clock shows 6:18 PM the same day?$q$,array[$q$6:00 PM$q$,$q$6:10 PM$q$,$q$5:54 PM$q$,$q$6:06 PM$q$],1,$q$63 clock-min = 60 true-min. Clock elapsed 378 min ⇒ true = 378·60/63 = 360 min ⇒ 6:00 PM.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A clock loses 5 minutes every hour. It is set right at 12:00 noon. What is the true time when the clock shows 5:30 PM?$q$,array[$q$5:30 PM$q$,$q$6:00 PM$q$,$q$5:45 PM$q$,$q$6:15 PM$q$],2,$q$55 clock-min = 60 true-min. Clock elapsed 330 min ⇒ true = 330·60/55 = 360 min ⇒ 6:00 PM.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A clock loses 4 minutes a day. If it is set right at 12 noon on Monday, after how many days will it again show the correct time?$q$,array[$q$120 days$q$,$q$90 days$q$,$q$360 days$q$,$q$180 days$q$],4,$q$A clock shows correct time after losing 12 h = 720 min; 720/4 = 180 days.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A watch gains 15 minutes per day. After being set correctly, after how many days will it next show the correct time?$q$,array[$q$48 days$q$,$q$24 days$q$,$q$72 days$q$,$q$96 days$q$],1,$q$Must gain a full 12 h = 720 min; 720/15 = 48 days.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A clock is seen in a mirror and the image shows the time as 4:20. What is the actual time?$q$,array[$q$8:40$q$,$q$7:40$q$,$q$6:20$q$,$q$7:20$q$],2,$q$Actual = 11:60 − shown = 11:60 − 4:20 = 7:40.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$When a clock is viewed in a mirror, the image shows 8:10. What is the actual time shown by the clock?$q$,array[$q$3:50$q$,$q$4:50$q$,$q$3:10$q$,$q$4:10$q$],1,$q$Actual = 11:60 − 8:10 = 3:50.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A wall clock's reflection in a mirror reads 2:30. What is the correct time?$q$,array[$q$10:30$q$,$q$8:30$q$,$q$9:30$q$,$q$9:00$q$],3,$q$Actual = 11:60 − 2:30 = 9:30.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$Two clocks are set correctly at 12 noon. One gains 1 minute per hour and the other loses 2 minutes per hour. After how long will they be exactly 1 hour apart?$q$,array[$q$20 hours$q$,$q$30 hours$q$,$q$15 hours$q$,$q$60 hours$q$],1,$q$Relative drift = 1 + 2 = 3 min/hr; to be 60 min apart takes 60/3 = 20 hours.$q$);
select public._seed_arith_q($q$Clocks$q$,'very_hard',$q$A watch is 2 minutes slow at noon on Monday and 4 min 48 sec fast at 2 PM on the following Monday. When did it show the correct time?$q$,array[$q$2 PM Tuesday$q$,$q$2 PM Wednesday$q$,$q$noon Wednesday$q$,$q$2 PM Thursday$q$],2,$q$From Mon noon to next Mon 2 PM = 170 h; total gain = 2 + 4.8 = 6.8 min. Time to gain 2 min = (2/6.8)·170 = 50 h = 2 PM Wednesday.$q$);

drop function public._seed_arith_q(text,text,text,text[],int,text);
