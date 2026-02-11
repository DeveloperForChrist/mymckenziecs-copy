#!/bin/bash
# Monitor case law population progress

echo "🔍 Case Law Population Monitor"
echo "================================"
echo ""

# Check if process is running
if ps aux | grep -q "[p]opulate-all-caselaw"; then
    echo "✅ Population script is RUNNING"
else
    echo "⚠️  Population script is NOT running"
fi

echo ""
echo "📊 Current Database Count:"
curl -sI "https://rxvuoixenzzxztjlsgms.supabase.co/rest/v1/case_law?select=citation" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dnVvaXhlbnp6eHp0amxzZ21zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1OTkwNTYsImV4cCI6MjA4MzE3NTA1Nn0.fk9PwV0Wd0s4IeyghANbio3VWljCcXuvI5XwnC8hf1I" \
  -H "Prefer: count=exact" 2>&1 | grep -i "content-range" | awk '{print $2}'

echo ""
echo "📝 Recent Log Output:"
tail -10 caselaw-population.log

echo ""
echo "💡 Commands:"
echo "   Watch progress: watch -n 10 ./scripts/monitor-caselaw.sh"
echo "   View full log:  tail -f caselaw-population.log"
echo "   Stop process:   pkill -f populate-all-caselaw"
