import React from "react";
import Image from "next/image";

interface SocialLink {
  url: string;
  icon: React.ReactNode;
}

interface TeamCardProps {
  name: string;
  jobTitle: string;
  imageSrc: string;
  socialLinks: SocialLink[];
}

const TeamCard: React.FC<TeamCardProps> = ({
  name,
  jobTitle,
  imageSrc,
  socialLinks,
}) => {
  return (
    <div id="team" className="card-wrapper">
      <div className="card">
        <div className="card-image">
          <Image
            src={imageSrc}
            alt={name}
            layout="fill"
            objectFit="cover"
            style={{
              objectPosition: "center 0%",
            }}
          />
        </div>
        <ul className="social-icons">
          {socialLinks.map((link, index) => (
            <li key={index}>
              <a href={link.url}>{link.icon}</a>
            </li>
          ))}
        </ul>
        <div className="details">
          <h2>
            {name}
            <br />
            <span className="job-title">{jobTitle}</span>
          </h2>
        </div>
      </div>
      <style jsx>{`
        .card-wrapper {
          width: 100%;
          height: 500px;
          position: relative;
        }

        .card {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          transform: translate(-50%, -50%);
          // border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 5px 7px rgba(0, 0, 0, 0.6);
          cursor: pointer;
          transition: 0.5s;
        }

        .card-image {
          position: absolute;
          top: 0px;
          left: 0px;
          width: 100%;
          height: 100%;
          z-index: 2;
          background-color: #000;
          transition: 0.5s;
        }

        .card:hover .card-image {
          transform: translateY(-100px);
          transition: all 0.9s;
          filter: brightness(0.7);
        }

        .social-icons {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 3;
          display: flex;
        }

        .social-icons li {
          list-style: none;
        }

        .social-icons li a {
          position: relative;
          display: flex;
          align-items: center; /* Center vertically */
          justify-content: center; /* Center horizontally */
          width: 50px;
          height: 50px;
          text-align: center;
          background: #fff;
          font-size: 23px;
          color: #333;
          font-weight: bold;
          margin: 0 6px;
          transition: 0.4s;
          transform: translateY(200px);
          opacity: 0;
        }

        .card:hover .social-icons li a {
          transform: translateY(0px);
          opacity: 1;
        }

        .social-icons li a:hover {
          background: #2bb673e3;
          transition: 0.2s;
        }

        .social-icons li a:hover .fab,
        .social-icons li a:hover .fas {
          transition: 0.8s;
        }

        .social-icons li a:hover .fab,
        .social-icons li a:hover .fas {
          transform: rotateY(360deg);
          color: #fff;
        }

        .card:hover li:nth-child(1) a {
          transition-delay: 0.1s;
        }

        .card:hover li:nth-child(2) a {
          transition-delay: 0.2s;
        }

        .card:hover li:nth-child(3) a {
          transition-delay: 0.3s;
        }

        .card:hover li:nth-child(4) a {
          transition-delay: 0.4s;
        }

        .details {
          position: absolute;
          bottom: 0;
          left: 0;
          background: #fff;
          width: 100%;
          height: 120px;
          z-index: 1;
          padding: 10px;
        }

        .details h2 {
          margin: 30px 0;
          padding: 0;
          text-align: center;
        }

        .details .job-title {
          font-size: 1rem;
          line-height: 2.5rem;
          color: #333;
          font-weight: 300;
        }
      `}</style>
    </div>
  );
};

export default TeamCard;
