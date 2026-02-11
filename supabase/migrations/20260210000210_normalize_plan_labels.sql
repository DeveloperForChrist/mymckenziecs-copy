-- Normalize legacy plan labels to current naming
UPDATE subscriptions SET plan_type = 'essential' WHERE plan_type = 'premium';
UPDATE subscriptions SET plan_type = 'plus' WHERE plan_type = 'premium pro';
