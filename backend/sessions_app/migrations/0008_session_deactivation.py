from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sessions_app', '0007_add_match_round_winner_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='auto_deactivated',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='session',
            name='last_round_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
