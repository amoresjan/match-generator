from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sessions_app', '0010_session_sport_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='pushsubscription',
            name='player_id',
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
