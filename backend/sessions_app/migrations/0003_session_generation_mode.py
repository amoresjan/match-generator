from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sessions_app', '0002_add_match_winner'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='generation_mode',
            field=models.CharField(
                choices=[('fair', 'fair'), ('competitive', 'competitive')],
                default='fair',
                max_length=11,
            ),
        ),
    ]
