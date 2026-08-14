<?php

error_reporting(E_ERROR | E_PARSE);

$name = $_POST['name'] ?? '';
$company = $_POST['company'] ?? '';
$phone = $_POST['phone'] ?? '';
$email = $_POST['email'] ?? '';
$project_location = $_POST['subject'] ?? '';
$project_type = $_POST['project_type'] ?? '';
$message = $_POST['message'] ?? '';
$verify = $_POST['verify'] ?? '';

function isEmail($email) {
    return (preg_match("/^[-_.[:alnum:]]+@((([[:alnum:]]|[[:alnum:]][[:alnum:]-]*[[:alnum:]])\.)+(ad|ae|aero|af|ag|ai|al|am|an|ao|aq|ar|arpa|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|biz|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|com|coop|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|edu|ee|eg|eh|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gh|gi|gl|gm|gn|gov|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|in|info|int|io|iq|ir|is|it|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mil|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|museum|mv|mw|mx|my|mz|na|name|nc|ne|net|nf|ng|ni|nl|no|np|nr|nt|nu|nz|om|org|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|pro|ps|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zw)$|(([0-9][0-9]?|[0-1][0-9][0-9]|[2][0-4][0-9]|[2][5][0-5])\.){3}([0-9][0-9]?|[0-1][0-9][0-9]|[2][0-4][0-9]|[2][5][0-5]))$/i", $email));
}

if (trim($name) == '') {
    echo '<div class="error_message">You must enter your name.</div>';
    exit();
} else if (trim($email) == '' || !isEmail($email)) {
    echo '<div class="error_message">Please enter a valid email address.</div>';
    exit();
} else if (trim($phone) == '') {
    echo '<div class="error_message">Please enter a valid phone number.</div>';
    exit();
} else if (!is_numeric($phone)) {
    echo '<div class="error_message">Phone number can only contain digits.</div>';
    exit();
} else if (trim($message) == '') {
    echo '<div class="error_message">Please enter your message.</div>';
    exit();
} else if (!isset($verify) || trim($verify) == '') {
    echo '<div class="error_message">Please answer the verification question.</div>';
    exit();
} else if (trim($verify) != '6') {
    echo '<div class="error_message">The verification answer you entered is incorrect.</div>';
    exit();
}

if (function_exists('get_magic_quotes_gpc') && get_magic_quotes_gpc()) {
    $message = stripslashes($message);
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require 'PHPMailer/Exception.php';
require 'PHPMailer/PHPMailer.php';
require 'PHPMailer/SMTP.php';

$mail = new PHPMailer(true);

$mail->SMTPDebug = 0;
$mail->isSMTP();
$mail->Host = 'mail.saraswebtech.in';
$mail->SMTPAuth = true;
$mail->Username = 'mail@saraswebtech.in';
$mail->Password = 'Mail@$0102';
$mail->SMTPSecure = 'ssl';
$mail->Port = 465;

$mail->setFrom('mail@saraswebtech.in', 'Virgin Energies Contact Form');
$mail->addAddress('saraswebtech@gmail.com', 'Virgin Energies');

$mail->isHTML(true);
$mail->Subject = 'Contact Form Submission: ' . ($project_type ?: 'General Inquiry');
$mail->Body = '<h3 align="left">New Contact Form Submission</h3>
<p><strong>Name:</strong> ' . htmlspecialchars($name) . '<br>
<strong>Company:</strong> ' . htmlspecialchars($company) . '<br>
<strong>Email:</strong> ' . htmlspecialchars($email) . '<br>
<strong>Phone:</strong> ' . htmlspecialchars($phone) . '<br>
<strong>Project Location:</strong> ' . htmlspecialchars($project_location) . '<br>
<strong>Project Type:</strong> ' . htmlspecialchars($project_type) . '<br>
<strong>Message:</strong><br>' . nl2br(htmlspecialchars($message)) . '</p>';
$mail->AltBody = "Name: $name\nCompany: $company\nEmail: $email\nPhone: $phone\nProject Location: $project_location\nProject Type: $project_type\nMessage: $message";

if (!$mail->send()) {
    echo 'Message could not be sent.';
    echo 'Mailer Error: ' . $mail->ErrorInfo;
} else {
    echo "Thank you $name, your message has been submitted to us.";
}
